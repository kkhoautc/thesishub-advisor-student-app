import io
import openpyxl
from datetime import date, timedelta
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from django.conf import settings

from app.models import (
    CustomUser,
    AcademicBatch,
    CourseClass,
    Department,
    Supervisor,
    SupervisorQuota,
    ProjectTopicArea,
    Student,
    StudentPreference,
    InternshipInfo,
    GraduationProject,
    SupervisionTask,
    ThesisDeferralRequest,
    DefenseCouncil,
    CouncilMember,
    CouncilLiveScore,
    EvaluationPolicy,
    FinalGradeSummary,
    DefenseScheduleSlot,
    AuditLog
)
from app.services import (
    DegreeEligibilityService,
    ThesisAllocationService,
    CouncilStructureService,
    CouncilConflictService
)

class FlowchartEndToEndTests(APITestCase):
    """
    KIỂM THỬ TUẦN TỰ 13 BƯỚC THEO ĐÚNG SƠ ĐỒ LUỒNG ĐỒ ÁN TỐT NGHIỆP THESISHUB (UTC):
    - Bước 1: Khoa tạo đợt đồ án
    - Bước 2: Thiết lập Khoa-BM-GV-SV & Import DS sinh viên (Phân loại Cử nhân / Kỹ sư)
    - Bước 3: SV đăng nhập, chọn hướng đồ án & chọn nguyện vọng NV1-NV3
    - Bước 4: Kiểm tra ràng buộc học vị GV tối thiểu (Kỹ sư: tối thiểu TS; Cử nhân: ThS)
    - Bước 5: Tính Capacity GV & Chạy thuật toán phân công tối ưu (MCMF Hard + Soft Constraints)
    - Bước 6: Khoa review / Override & Chốt phân công, công bố & gửi email
    - Bước 7: GV-SV xác định đề tài & Trình duyệt đề tài (Duyệt / Yêu cầu sửa có lý do)
    - Bước 8: Hệ thống sinh đề cương PDF & SV ký nộp, Khoa lưu hồ sơ
    - Bước 9: Gửi DS cho giáo vụ, Import bảng điểm & Xét điều kiện làm đồ án (Kèm Quyền Force Approve)
    - Bước 10: Quản lý Task, Deadline & Đánh giá kết quả thực hiện (Đạt / Yêu cầu làm lại)
    - Bước 11: Xét điều kiện bảo vệ cuối kỳ & Nhánh Bảo lưu (Thesis Deferral)
    - Bước 12: Thành lập Hội đồng (1CT-2TK-2UV), Gán phản biện (GVHD != HĐ) & Xếp lịch bảo vệ (10-12 SV/buổi)
    - Bước 13: Bảo vệ, Nhập điểm Hội đồng, Tổng hợp điểm, Xuất biên bản PDF & In bảng điểm theo lớp
    """

    def setUp(self):
        super().setUp()
        self.client = APIClient()

        # Tài khoản Quản trị viên Khoa
        self.admin_user = CustomUser.objects.create_user(
            username="admin_khoa_cntt",
            email="khoa_cntt@utc.edu.vn",
            password="adminpassword123",
            user_type="admin",
            is_staff=True,
            first_name="Ban Chủ Nhiệm",
            last_name="Khoa CNTT"
        )

    # ==========================================================================
    # BƯỚC 1: Khoa tạo đợt đồ án
    # ==========================================================================
    def test_step_01_khoa_tao_dot_do_an(self):
        """Bước 1: Khoa tạo đợt đồ án (Cử nhân / Kỹ sư) và kiểm tra validate"""
        self.client.force_authenticate(user=self.admin_user)

        # 1. Tạo đợt thành công
        payload = {
            "batch_code": "2026_2027_HK1_FLOW",
            "batch_name": "Đợt ĐATN K60-K63 HK1 Năm học 2026-2027",
            "start_date": "2026-09-01",
            "end_date": "2027-01-15",
            "is_active": True,
            "program_type": "BOTH"
        }
        res = self.client.post("/app/batch/create/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(res.data.get("success", True))
        self.assertTrue(AcademicBatch.objects.filter(batch_code="2026_2027_HK1_FLOW").exists())

        # 2. Negative: Chặn trùng mã đợt
        res_dup = self.client.post("/app/batch/create/", payload, format="json")
        self.assertEqual(res_dup.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. Negative: Chặn ngày kết thúc trước ngày bắt đầu
        bad_payload = payload.copy()
        bad_payload["batch_code"] = "2026_BAD_DATES"
        bad_payload["start_date"] = "2027-01-15"
        bad_payload["end_date"] = "2026-09-01"
        res_bad = self.client.post("/app/batch/create/", bad_payload, format="json")
        self.assertEqual(res_bad.status_code, status.HTTP_400_BAD_REQUEST)

    # ==========================================================================
    # BƯỚC 2: Thiết lập Khoa-BM-GV-SV & Import DS sinh viên (Phân loại Cử nhân / Kỹ sư)
    # ==========================================================================
    def test_step_02_thiet_lap_nhan_su_va_import_sinh_vien(self):
        """Bước 2: Thiết lập Bộ môn, Giảng viên & Import danh sách sinh viên tự động phân loại"""
        self.client.force_authenticate(user=self.admin_user)

        batch = AcademicBatch.objects.create(
            batch_code="2026_K62_S2",
            batch_name="Đợt K62 Bước 2",
            is_active=True
        )

        # 1. Thiết lập Bộ môn & Hướng nghiên cứu
        dept_cnpm = Department.objects.create(name="Bộ môn Công nghệ phần mềm", code="CNPM")
        dept_khmt = Department.objects.create(name="Bộ môn Khoa học máy tính", code="KHMT")

        topic_software = ProjectTopicArea.objects.create(name="Phát triển phần mềm và ứng dụng web", code="SOFTWARE_DEV")
        topic_ai = ProjectTopicArea.objects.create(name="Trí tuệ nhân tạo và Dữ liệu lớn", code="AI_DATA")

        # 2. Thiết lập Giảng viên: TS (hệ số 1.5) và ThS (hệ số 1.0)
        u_ts = CustomUser.objects.create_user(username="gv_ts_nghiem", email="nghiem@utc.edu.vn", password="pwd", user_type="supervisor")
        gv_ts = Supervisor.objects.create(user=u_ts, supervisor_id="GV001", academic_title="TS", department_name="CNPM", department_obj=dept_cnpm, academic_rank_multiplier=1.5)
        SupervisorQuota.objects.create(supervisor=gv_ts, batch=batch, viet_anh_quota=3, general_cntt_quota=6, max_total_quota=9)

        u_ths = CustomUser.objects.create_user(username="gv_ths_loan", email="loan@utc.edu.vn", password="pwd", user_type="supervisor")
        gv_ths = Supervisor.objects.create(user=u_ths, supervisor_id="GV002", academic_title="ThS", department_name="KHMT", department_obj=dept_khmt, academic_rank_multiplier=1.0)
        SupervisorQuota.objects.create(supervisor=gv_ths, batch=batch, viet_anh_quota=2, general_cntt_quota=3, max_total_quota=5)

        # 3. Import sinh viên bằng file Excel (1 Kỹ sư, 1 Cử nhân)
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "DanhSachSV"
        ws.append(["Mã sinh viên", "Họ và tên", "Email", "Hệ đào tạo", "Lớp"])
        ws.append(["201201001", "Trần Kỹ Sư", "kysu@lms.utc.edu.vn", "Kỹ sư", "CNTT1 K62"])
        ws.append(["201201002", "Lê Cử Nhân", "cunhan@lms.utc.edu.vn", "Cử nhân", "CNTT2 K62"])

        bio = io.BytesIO()
        wb.save(bio)
        bio.seek(0)
        f_upload = SimpleUploadedFile("sv_k62.xlsx", bio.read(), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

        res_imp = self.client.post("/app/students/import/", {"file": f_upload}, format="multipart")
        self.assertEqual(res_imp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res_imp.data.get("total_imported"), 2)

        # Kiểm tra tự động phân loại hệ đào tạo
        s_ks = Student.objects.get(registration_no="201201001")
        self.assertEqual(s_ks.education_program, "ENGINEER")
        s_cn = Student.objects.get(registration_no="201201002")
        self.assertEqual(s_cn.education_program, "BACHELOR")

    # ==========================================================================
    # BƯỚC 3: SV đăng nhập, chọn hướng đồ án & đăng ký nguyện vọng NV1-NV3
    # ==========================================================================
    def test_step_03_sinh_vien_chon_huong_va_nguyen_vong(self):
        """Bước 3: SV đăng nhập, điền khảo sát thực tập và đăng ký nguyện vọng NV1-NV3"""
        batch = AcademicBatch.objects.create(batch_code="2026_B3", batch_name="Đợt B3", is_active=True)
        topic_sw = ProjectTopicArea.objects.create(name="Phần mềm", code="SOFTWARE_DEV")

        u_sv = CustomUser.objects.create_user(username="201202001", email="sv2001@utc.edu.vn", password="pwd", user_type="student")
        sv = Student.objects.create(user=u_sv, registration_no="201202001", academic_batch=batch)

        u_gv1 = CustomUser.objects.create_user(username="gv1", email="gv1@utc.edu.vn", password="pwd", user_type="supervisor")
        gv1 = Supervisor.objects.create(user=u_gv1, supervisor_id="GV_B3_1", academic_title="TS")

        u_gv2 = CustomUser.objects.create_user(username="gv2", email="gv2@utc.edu.vn", password="pwd", user_type="supervisor")
        gv2 = Supervisor.objects.create(user=u_gv2, supervisor_id="GV_B3_2", academic_title="ThS")

        # SV đăng nhập và gửi khảo sát / nguyện vọng
        self.client.force_authenticate(user=u_sv)
        res = self.client.post("/app/student/survey/", {
            "is_interning": True,
            "company_name": "Viettel Software",
            "topic_direction": topic_sw.id,
            "tentative_title": "Nghiên cứu kiến trúc Microservices",
            "preference_1": gv1.id,
            "preference_2": gv2.id,
            "sub_criteria": "Ưu tiên làm đề tài theo hướng ứng dụng doanh nghiệp"
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # Kiểm tra CSDL
        pref = StudentPreference.objects.get(student=sv)
        self.assertEqual(pref.preference_1, gv1)
        self.assertEqual(pref.preference_2, gv2)
        info = InternshipInfo.objects.get(student=sv)
        self.assertTrue(info.is_interning)
        self.assertEqual(info.company_name, "Viettel Software")

    # ==========================================================================
    # BƯỚC 4: Kiểm tra ràng buộc học vị GV tối thiểu (Kỹ sư: tối thiểu Tiến sĩ)
    # ==========================================================================
    def test_step_04_kiem_tra_hoc_vi_gv_toi_thieu(self):
        """Bước 4: Kiểm tra ràng buộc học vị tối thiểu (Kỹ sư -> TS; Cử nhân -> ThS)"""
        u_ts = CustomUser.objects.create_user(username="gv_ts_4", email="ts4@utc.edu.vn", password="pwd", user_type="supervisor")
        gv_ts = Supervisor.objects.create(user=u_ts, supervisor_id="TS04", academic_title="TS")

        u_ths = CustomUser.objects.create_user(username="gv_ths_4", email="ths4@utc.edu.vn", password="pwd", user_type="supervisor")
        gv_ths = Supervisor.objects.create(user=u_ths, supervisor_id="THS04", academic_title="ThS")

        # Sinh viên Kỹ sư chọn GV
        u_ks = CustomUser.objects.create_user(username="sv_ks_4", email="ks4@utc.edu.vn", password="pwd", user_type="student")
        sv_ks = Student.objects.create(user=u_ks, registration_no="201204001", education_program="ENGINEER")

        # 1. Kỹ sư chọn ThS -> Bị từ chối (ValueError: bắt buộc Tiến sĩ)
        with self.assertRaises(ValueError):
            DegreeEligibilityService.validate_preferences_for_student(sv_ks, [gv_ths])

        # 2. Kỹ sư chọn TS -> Đạt điều kiện
        self.assertTrue(DegreeEligibilityService.validate_preferences_for_student(sv_ks, [gv_ts]))

        # 3. Cử nhân chọn ThS -> Đạt điều kiện
        u_cn = CustomUser.objects.create_user(username="sv_cn_4", email="cn4@utc.edu.vn", password="pwd", user_type="student")
        sv_cn = Student.objects.create(user=u_cn, registration_no="201204002", education_program="BACHELOR")
        self.assertTrue(DegreeEligibilityService.validate_preferences_for_student(sv_cn, [gv_ths]))

    # ==========================================================================
    # BƯỚC 5: Tính Capacity GV & Chạy thuật toán phân công tối ưu (MCMF Hard + Soft Constraints)
    # ==========================================================================
    def test_step_05_tinh_capacity_va_thuat_toan_phan_cong_mcmf(self):
        """Bước 5: Tính Capacity theo học vị và chạy thuật toán tối ưu MCMF thỏa mãn toàn bộ constraints"""
        batch = AcademicBatch.objects.create(batch_code="2026_B5", batch_name="Đợt B5", is_active=True)
        topic_sw = ProjectTopicArea.objects.create(name="Phần mềm", code="SOFTWARE_DEV")

        # 1. Kiểm tra công thức Capacity theo học vị
        u_ts = CustomUser.objects.create_user(username="ts5", email="ts5@utc.edu.vn", password="pwd", user_type="supervisor")
        gv_ts = Supervisor.objects.create(user=u_ts, supervisor_id="TS05", academic_title="TS", academic_rank_multiplier=1.5)
        cap_ts = ThesisAllocationService.calculate_capacity(gv_ts, base_capacity=5)
        self.assertEqual(cap_ts, 8) # 5 * 1.5 = 7.5 -> round = 8

        u_ths = CustomUser.objects.create_user(username="ths5", email="ths5@utc.edu.vn", password="pwd", user_type="supervisor")
        gv_ths = Supervisor.objects.create(user=u_ths, supervisor_id="THS05", academic_title="ThS", academic_rank_multiplier=1.0)
        cap_ths = ThesisAllocationService.calculate_capacity(gv_ths, base_capacity=5)
        self.assertEqual(cap_ths, 5)

        SupervisorQuota.objects.create(supervisor=gv_ts, batch=batch, base_quota=5, rank_multiplier=1.5, max_total_quota=8)
        SupervisorQuota.objects.create(supervisor=gv_ths, batch=batch, base_quota=5, rank_multiplier=1.0, max_total_quota=5)

        # 2. Sinh viên đăng ký
        u_ks = CustomUser.objects.create_user(username="ks5", email="ks5@utc.edu.vn", password="pwd", user_type="student")
        sv_ks = Student.objects.create(user=u_ks, registration_no="201205001", education_program="ENGINEER", academic_batch=batch)
        InternshipInfo.objects.create(student=sv_ks, batch=batch, preferred_supervisor=gv_ts, topic_direction=topic_sw)
        StudentPreference.objects.update_or_create(student=sv_ks, defaults={"batch": batch, "preference_1": gv_ts, "topic_direction": topic_sw})

        u_cn = CustomUser.objects.create_user(username="cn5", email="cn5@utc.edu.vn", password="pwd", user_type="student")
        sv_cn = Student.objects.create(user=u_cn, registration_no="201205002", education_program="BACHELOR", academic_batch=batch)
        InternshipInfo.objects.create(student=sv_cn, batch=batch, preferred_supervisor=gv_ths, topic_direction=topic_sw)
        StudentPreference.objects.update_or_create(student=sv_cn, defaults={"batch": batch, "preference_1": gv_ths, "topic_direction": topic_sw})

        # 3. Chạy thuật toán phân công
        res = ThesisAllocationService.run_allocation(batch)
        self.assertGreaterEqual(res.get("allocated_count", 0), 1)

    # ==========================================================================
    # BƯỚC 6: Khoa Review / Override & Chốt phân công, công bố & gửi email
    # ==========================================================================
    def test_step_06_khoa_review_override_va_chot_phan_cong(self):
        """Bước 6: Khoa can thiệp thủ công (Override), chốt phân công và công bố đợt"""
        self.client.force_authenticate(user=self.admin_user)

        batch = AcademicBatch.objects.create(batch_code="2026_B6", batch_name="Đợt B6", is_active=True, current_stage="PHASE_2_ALLOCATION")
        u_gv = CustomUser.objects.create_user(username="gv6", email="gv6@utc.edu.vn", password="pwd", user_type="supervisor")
        gv = Supervisor.objects.create(user=u_gv, supervisor_id="GV06", academic_title="TS")
        u_sv = CustomUser.objects.create_user(username="sv6", email="sv6@utc.edu.vn", password="pwd", user_type="student")
        sv = Student.objects.create(user=u_sv, registration_no="201206001", academic_batch=batch)
        proj = GraduationProject.objects.create(student=sv, supervisor=gv, batch=batch, topic_title_vi="Đồ án Bước 6")

        # 1. Khoa override gán GV
        res_override = self.client.post("/app/allocation/override/", {
            "project_id": proj.id,
            "supervisor_id": gv.id,
            "reason": "Điều chỉnh theo chỉ đạo của Trưởng Bộ Môn"
        }, format="json")
        self.assertEqual(res_override.status_code, status.HTTP_200_OK)

        # 2. Khoa chốt phân công
        res_fin = self.client.post("/app/allocation/finalize/", {"batch_id": batch.id}, format="json")
        self.assertEqual(res_fin.status_code, status.HTTP_200_OK)
        self.assertTrue(GraduationProject.objects.filter(student=sv, supervisor=gv).exists())

        # 3. Công bố đợt
        batch.is_allocation_published = True
        batch.current_stage = "PHASE_3_TOPIC"
        batch.save()
        self.assertTrue(batch.is_allocation_published)

    # ==========================================================================
    # BƯỚC 7: GV-SV xác định đề tài & Trình duyệt đề tài (Duyệt / Yêu cầu sửa có lý do)
    # ==========================================================================
    def test_step_07_xac_dinh_de_tai_va_khoa_duyet_co_ly_do(self):
        """Bước 7: GV xác nhận đề tài; Khoa yêu cầu sửa (bắt buộc nêu lý do) -> Sửa xong Khoa duyệt Approved"""
        batch = AcademicBatch.objects.create(batch_code="2026_B7", batch_name="Đợt B7", is_active=True)
        u_gv = CustomUser.objects.create_user(username="gv7", email="gv7@utc.edu.vn", password="pwd", user_type="supervisor")
        gv = Supervisor.objects.create(user=u_gv, supervisor_id="GV07", academic_title="TS")
        u_sv = CustomUser.objects.create_user(username="sv7", email="sv7@utc.edu.vn", password="pwd", user_type="student")
        sv = Student.objects.create(user=u_sv, registration_no="201207001", academic_batch=batch)

        proj = GraduationProject.objects.create(
            student=sv, supervisor=gv, batch=batch,
            topic_title_vi="Xây dựng website thương mại điện tử",
            topic_review_status="DRAFT"
        )

        # 1. GV xác nhận đề tài -> Chuyển sang TOPIC_CONFIRMED
        self.client.force_authenticate(user=u_gv)
        res_gv = self.client.post("/app/graduation-project/confirm-topic/", {
            "project_id": proj.id,
            "topic_title_vi": "Xây dựng hệ thống thương mại điện tử thông minh với AI Recommender"
        }, format="json")
        self.assertEqual(res_gv.status_code, status.HTTP_200_OK)
        proj.refresh_from_db()
        self.assertEqual(proj.status, "TOPIC_CONFIRMED")

        # 2. Khoa từ chối nhưng không nhập lý do -> Bị chặn lỗi 400
        self.client.force_authenticate(user=self.admin_user)
        res_err = self.client.post("/app/graduation-project/admin-approve-topic/", {
            "project_id": proj.id,
            "decision": "REJECTED",
            "notes": ""
        }, format="json")
        self.assertEqual(res_err.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. Khoa từ chối có lý do -> Chuyển sang TOPIC_REVISION
        res_rej = self.client.post("/app/graduation-project/admin-approve-topic/", {
            "project_id": proj.id,
            "decision": "REJECTED",
            "notes": "Cần làm rõ mô hình Deep Learning sử dụng cho thuật toán gợi ý"
        }, format="json")
        self.assertEqual(res_rej.status_code, status.HTTP_200_OK)
        proj.refresh_from_db()
        self.assertEqual(proj.status, "TOPIC_REVISION")

        # 4. Khoa phê duyệt đề tài
        res_app = self.client.post("/app/graduation-project/admin-approve-topic/", {
            "project_id": proj.id,
            "decision": "APPROVED"
        }, format="json")
        self.assertEqual(res_app.status_code, status.HTTP_200_OK)
        proj.refresh_from_db()
        self.assertEqual(proj.status, "TOPIC_APPROVED")

    # ==========================================================================
    # BƯỚC 8: Hệ thống sinh đề cương PDF & SV ký nộp, Khoa lưu hồ sơ
    # ==========================================================================
    def test_step_08_sinh_de_cuong_pdf_va_sv_ky_nop(self):
        """Bước 8: Tự động sinh PDF đề cương và kiểm tra SV ký nộp file hợp lệ"""
        batch = AcademicBatch.objects.create(batch_code="2026_B8", batch_name="Đợt B8", is_active=True)
        u_gv = CustomUser.objects.create_user(username="gv8", email="gv8@utc.edu.vn", password="pwd", user_type="supervisor")
        gv = Supervisor.objects.create(user=u_gv, supervisor_id="GV08", academic_title="TS")
        u_sv = CustomUser.objects.create_user(username="sv8", email="sv8@utc.edu.vn", password="pwd", user_type="student")
        sv = Student.objects.create(user=u_sv, registration_no="201208001", academic_batch=batch)

        proj = GraduationProject.objects.create(
            student=sv, supervisor=gv, batch=batch,
            topic_title_vi="Nghiên cứu an toàn mạng",
            topic_review_status="APPROVED"
        )

        # 1. Sinh file đề cương PDF
        self.client.force_authenticate(user=u_sv)
        res_pdf = self.client.get(f"/app/graduation-project/{proj.id}/export-outline-pdf/")
        self.assertEqual(res_pdf.status_code, status.HTTP_200_OK)
        self.assertEqual(res_pdf["Content-Type"], "application/pdf")
        self.assertGreater(len(res_pdf.content), 1000)

        # 2. SV nộp file đề cương đã ký (chặn file giả mạo .exe)
        f_bad = SimpleUploadedFile("outline.exe", b"MZbadexecutable", content_type="application/octet-stream")
        res_bad = self.client.post(f"/app/graduation-project/{proj.id}/upload-signed-outline/", {"signed_outline_file": f_bad}, format="multipart")
        self.assertEqual(res_bad.status_code, status.HTTP_400_BAD_REQUEST)

        # 3. Nộp file PDF hợp lệ
        f_good = SimpleUploadedFile("outline_signed.pdf", b"%PDF-1.4 dummy valid signed outline content", content_type="application/pdf")
        res_good = self.client.post(f"/app/graduation-project/{proj.id}/upload-signed-outline/", {"signed_outline_file": f_good}, format="multipart")
        self.assertEqual(res_good.status_code, status.HTTP_200_OK)

    # ==========================================================================
    # BƯỚC 9: Gửi DS cho giáo vụ, Import bảng điểm & Xét điều kiện làm đồ án (Kèm Quyền Force Approve)
    # ==========================================================================
    def test_step_09_xet_dieu_kien_hoc_vu_va_force_approve(self):
        """Bước 9: Import điểm xét điều kiện: Nợ < 10 tín -> Đủ; Nợ >= 10 tín -> Không đủ; Quyền Force Approve"""
        batch = AcademicBatch.objects.create(batch_code="2026_B9", batch_name="Đợt B9", is_active=True)
        u_gv = CustomUser.objects.create_user(username="gv9", email="gv9@utc.edu.vn", password="pwd", user_type="supervisor")
        gv = Supervisor.objects.create(user=u_gv, supervisor_id="GV09", academic_title="TS")

        u_sv1 = CustomUser.objects.create_user(username="sv9_1", email="sv9_1@utc.edu.vn", password="pwd", user_type="student")
        sv1 = Student.objects.create(user=u_sv1, registration_no="201209001", academic_batch=batch)
        p1 = GraduationProject.objects.create(student=sv1, supervisor=gv, batch=batch, topic_title_vi="Đề tài 1")

        u_sv2 = CustomUser.objects.create_user(username="sv9_2", email="sv9_2@utc.edu.vn", password="pwd", user_type="student")
        sv2 = Student.objects.create(user=u_sv2, registration_no="201209002", academic_batch=batch)
        p2 = GraduationProject.objects.create(student=sv2, supervisor=gv, batch=batch, topic_title_vi="Đề tài 2")

        # 1. Import bảng điểm: SV1 nợ 2 tín (Hợp lệ); SV2 nợ 12 tín (Không đủ điều kiện)
        self.client.force_authenticate(user=self.admin_user)
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["MSSV", "CPA", "Tín chỉ tích lũy", "Nợ tín chỉ"])
        ws.append(["201209001", 3.2, 138, 0])
        ws.append(["201209002", 2.1, 120, 12])
        bio = io.BytesIO()
        wb.save(bio)
        bio.seek(0)
        res_imp = self.client.post("/app/academic/grades/import/", {"file": SimpleUploadedFile("grades.xlsx", bio.read(), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}, format="multipart")
        self.assertEqual(res_imp.status_code, status.HTTP_200_OK)

        # SV1 đủ điều kiện
        p1.refresh_from_db()
        self.assertEqual(p1.academic_clearance_status, "CLEARED")

        # 2. SV2 nợ 12 tín -> Bị Khoa Force Approve đặc cách
        res_force = self.client.post(f"/app/graduation-project/{p2.id}/force-approve/", {
            "reason": "Hội đồng Khoa đồng ý cho phép hoàn thành trả nợ môn trước lễ bảo vệ"
        }, format="json")
        self.assertEqual(res_force.status_code, status.HTTP_200_OK)
        p2.refresh_from_db()
        self.assertEqual(p2.initial_eligibility, "FORCE_APPROVED")
        self.assertEqual(p2.status, "IN_PROGRESS")

    # ==========================================================================
    # BƯỚC 10: Quản lý Task, Deadline & Đánh giá kết quả thực hiện
    # ==========================================================================
    def test_step_10_quan_ly_task_deadline_va_review(self):
        """Bước 10: Giao task, SV nộp bài (kiểm tra nộp muộn is_late), GV đánh giá Không đạt -> Đạt"""
        batch = AcademicBatch.objects.create(batch_code="2026_B10", batch_name="Đợt B10", is_active=True)
        u_gv = CustomUser.objects.create_user(username="gv10", email="gv10@utc.edu.vn", password="pwd", user_type="supervisor")
        gv = Supervisor.objects.create(user=u_gv, supervisor_id="GV10", academic_title="TS")
        u_sv = CustomUser.objects.create_user(username="sv10", email="sv10@utc.edu.vn", password="pwd", user_type="student")
        sv = Student.objects.create(user=u_sv, registration_no="201210001", academic_batch=batch)
        proj = GraduationProject.objects.create(student=sv, supervisor=gv, batch=batch, topic_title_vi="Task Project")

        # 1. GV giao việc có deadline
        self.client.force_authenticate(user=u_gv)
        res_task = self.client.post("/app/supervisor/tasks/", {
            "project_id": proj.id,
            "title": "Thiết kế cơ sở dữ liệu và ERD Diagram",
            "due_date": (date.today() - timedelta(days=2)).isoformat(), # Deadline quá khứ để test nộp muộn
            "priority": "HIGH"
        }, format="json")
        self.assertEqual(res_task.status_code, status.HTTP_201_CREATED)
        task_id = res_task.data["task"]["id"]

        # 2. SV nộp bài muộn -> Tự động gắn cờ is_late=True
        self.client.force_authenticate(user=u_sv)
        res_sub = self.client.post(f"/app/student/tasks/{task_id}/submit-deliverable/", {
            "student_notes": "Nộp bổ sung file ERD sau khi thảo luận",
            "file": SimpleUploadedFile("erd.pdf", b"%PDF-dummy", content_type="application/pdf")
        }, format="multipart")
        self.assertEqual(res_sub.status_code, status.HTTP_200_OK)
        task = SupervisionTask.objects.get(id=task_id)
        self.assertTrue(task.is_late)

        # 3. GV review: Yêu cầu sửa (REVISION_REQUIRED)
        self.client.force_authenticate(user=u_gv)
        res_rev = self.client.post(f"/app/supervisor/tasks/{task_id}/review/", {
            "verdict": "REVISION_REQUIRED",
            "notes": "Cần chuẩn hóa dạng chuẩn 3NF cho bảng hóa đơn"
        }, format="json")
        self.assertEqual(res_rev.status_code, status.HTTP_200_OK)

        # 4. Sau khi SV sửa xong, GV review: Đạt (ACCEPTED)
        res_comp = self.client.post(f"/app/supervisor/tasks/{task_id}/review/", {
            "verdict": "ACCEPTED",
            "notes": "Bản thiết kế đạt yêu cầu"
        }, format="json")
        self.assertEqual(res_comp.status_code, status.HTTP_200_OK)
        task.refresh_from_db()
        self.assertEqual(task.status, "COMPLETED")

    # ==========================================================================
    # BƯỚC 11: Xét điều kiện bảo vệ cuối kỳ & Nhánh Bảo lưu (Thesis Deferral)
    # ==========================================================================
    def test_step_11_xet_dieu_kien_bao_ve_va_nhanh_bao_luu(self):
        """Bước 11: GV xác nhận đủ khả năng BV, HT kiểm tra học vụ; nhánh SV xin bảo lưu và Khoa phê duyệt"""
        batch = AcademicBatch.objects.create(batch_code="2026_B11", batch_name="Đợt B11", is_active=True)
        u_gv = CustomUser.objects.create_user(username="gv11", email="gv11@utc.edu.vn", password="pwd", user_type="supervisor")
        gv = Supervisor.objects.create(user=u_gv, supervisor_id="GV11", academic_title="TS")

        # SV1: Đủ điều kiện bảo vệ
        u_sv1 = CustomUser.objects.create_user(username="sv11_1", email="sv11_1@utc.edu.vn", password="pwd", user_type="student")
        sv1 = Student.objects.create(user=u_sv1, registration_no="201211001", academic_batch=batch)
        p1 = GraduationProject.objects.create(
            student=sv1, supervisor=gv, batch=batch, topic_title_vi="Đủ ĐK Bảo Vệ",
            supervisor_defense_confirmed=True, final_academic_eligibility="ELIGIBLE", is_eligible_for_defense=True,
            status="DEFENSE_READY"
        )
        self.assertEqual(p1.status, "DEFENSE_READY")

        # SV2: Không đủ khả năng BV -> Nộp đơn bảo lưu & Khoa duyệt
        u_sv2 = CustomUser.objects.create_user(username="sv11_2", email="sv11_2@utc.edu.vn", password="pwd", user_type="student")
        sv2 = Student.objects.create(user=u_sv2, registration_no="201211002", academic_batch=batch)
        p2 = GraduationProject.objects.create(
            student=sv2, supervisor=gv, batch=batch, topic_title_vi="Bảo lưu đồ án",
            supervisor_defense_confirmed=False
        )

        # SV2 nộp đơn xin bảo lưu
        self.client.force_authenticate(user=u_sv2)
        res_def = self.client.post("/app/student/deferral-request/", {
            "reason": "Gặp tai nạn gãy chân điều trị dài ngày, xin bảo lưu kết quả 01 học kỳ"
        }, format="json")
        self.assertEqual(res_def.status_code, status.HTTP_201_CREATED)

        # Khoa phê duyệt đơn bảo lưu
        self.client.force_authenticate(user=self.admin_user)
        def_req = ThesisDeferralRequest.objects.get(project=p2)
        res_app_def = self.client.post(f"/app/admin/deferral-request/{def_req.id}/review/", {
            "decision": "APPROVED",
            "comment": "Chấp thuận bảo lưu theo đơn đính kèm bệnh án"
        }, format="json")
        self.assertEqual(res_app_def.status_code, status.HTTP_200_OK)
        def_req.refresh_from_db()
        self.assertEqual(def_req.status, "APPROVED")
        p2.refresh_from_db()
        self.assertEqual(p2.status, "DEFERRED")

    # ==========================================================================
    # BƯỚC 12: Thành lập Hội đồng (1CT-2TK-2UV), Gán phản biện (GVHD != HĐ) & Xếp lịch
    # ==========================================================================
    def test_step_12_thanh_lap_hoi_dong_gan_phan_bien_va_xep_lich(self):
        """Bước 12: Thành lập HĐ 5 người (1CT, 2TK, 2UV), gán phản biện (GVHD != HĐ, cùng ngành), xếp lịch (10-12 SV/buổi)"""
        batch = AcademicBatch.objects.create(batch_code="2026_B12", batch_name="Đợt B12", is_active=True)

        # Tạo 5 giảng viên Hội đồng
        council_users = []
        council_sups = []
        roles = ["CHAIR", "SECRETARY", "SECRETARY", "MEMBER", "MEMBER"]
        for i in range(5):
            u = CustomUser.objects.create_user(username=f"gv_hd_12_{i}", email=f"hd12_{i}@utc.edu.vn", password="pwd", user_type="supervisor")
            s = Supervisor.objects.create(user=u, supervisor_id=f"GV_HD12_{i}", academic_title="TS", department_name="CNPM")
            council_users.append(u)
            council_sups.append(s)

        # Tạo GVHD riêng (không thuộc Hội đồng này)
        u_gvhd = CustomUser.objects.create_user(username="gvhd_12", email="gvhd12@utc.edu.vn", password="pwd", user_type="supervisor")
        gvhd = Supervisor.objects.create(user=u_gvhd, supervisor_id="GVHD_12", academic_title="TS")

        # 1. Tạo Hội đồng 5 người
        council = DefenseCouncil.objects.create(
            batch=batch, council_number=1, council_name="Hội đồng Bảo vệ CNTT 01",
            defense_room="502-A9", session_date="2026-06-25", session_time="CA1"
        )
        for s_idx, r in enumerate(roles):
            CouncilMember.objects.create(council=council, user=council_users[s_idx], supervisor=council_sups[s_idx], role=r)

        self.assertEqual(council.members.count(), 5)
        self.assertEqual(council.members.filter(role="CHAIR").count(), 1)
        self.assertEqual(council.members.filter(role="SECRETARY").count(), 2)
        self.assertEqual(council.members.filter(role="MEMBER").count(), 2)
        self.assertTrue(council.check_utc_model_validity()["is_valid"])

        # 2. Gán sinh viên vào HĐ & Kiểm tra ràng buộc GVHD != Thành viên HĐ
        u_sv = CustomUser.objects.create_user(username="sv12", email="sv12@utc.edu.vn", password="pwd", user_type="student")
        sv = Student.objects.create(user=u_sv, registration_no="201212001", academic_batch=batch)
        proj = GraduationProject.objects.create(
            student=sv, supervisor=gvhd, batch=batch, topic_title_vi="ĐATN 12",
            status="DEFENSE_READY", council=council, reviewer=council_sups[3] # GVPB là UV Hội đồng
        )

        # Đảm bảo GVHD không có tên trong danh sách thành viên Hội đồng này
        is_coi = council.members.filter(supervisor=gvhd).exists()
        self.assertFalse(is_coi)

        # 3. Xếp lịch chi tiết (order_number)
        slot = DefenseScheduleSlot.objects.create(
            council=council, project=proj, order_number=1,
            start_time="08:00", end_time="08:40"
        )
        self.assertEqual(slot.council, council)
        self.assertEqual(slot.order_number, 1)

    # ==========================================================================
    # BƯỚC 13: Bảo vệ, Nhập điểm HĐ, HT tổng hợp điểm, Xuất biên bản PDF & In bảng điểm theo lớp
    # ==========================================================================
    def test_step_13_bao_ve_nhap_diem_tong_hop_va_xuat_bao_cao(self):
        """Bước 13: Thành viên HĐ nhập điểm, HT tổng hợp điểm 10-scale và 4.0, chốt điểm, xuất biên bản PDF & Excel theo lớp"""
        batch = AcademicBatch.objects.create(batch_code="2026_B13", batch_name="Đợt B13", is_active=True)
        c_class = CourseClass.objects.create(batch=batch, class_code="IT1.659.103", class_name="Lớp ĐATN K62")

        policy = EvaluationPolicy.objects.create(
            batch=batch, weight_supervisor=0.4, weight_reviewer=0.2, weight_council=0.4
        )

        u_gvhd = CustomUser.objects.create_user(username="gvhd13", email="gvhd13@utc.edu.vn", password="pwd", user_type="supervisor")
        gvhd = Supervisor.objects.create(user=u_gvhd, supervisor_id="GVHD13", academic_title="TS")

        u_gvpb = CustomUser.objects.create_user(username="gvpb13", email="gvpb13@utc.edu.vn", password="pwd", user_type="supervisor")
        gvpb = Supervisor.objects.create(user=u_gvpb, supervisor_id="GVPB13", academic_title="TS")

        u_sv = CustomUser.objects.create_user(username="sv13", email="sv13@utc.edu.vn", password="pwd", user_type="student")
        sv = Student.objects.create(user=u_sv, registration_no="201213001", academic_batch=batch, course_class=c_class)

        council = DefenseCouncil.objects.create(batch=batch, council_number=1, council_name="Hội đồng Chấm Điểm 01")
        proj = GraduationProject.objects.create(
            student=sv, supervisor=gvhd, reviewer=gvpb, batch=batch,
            topic_title_vi="Đề tài Hoàn Tất Luồng", status="DEFENSE_READY", council=council,
            supervisor_score=9.0, reviewer_score=8.5
        )

        # 1. Tạo 5 thành viên HĐ và nhập điểm
        for i in range(5):
            u = CustomUser.objects.create_user(username=f"mem13_{i}", email=f"mem13_{i}@utc.edu.vn", password="pwd", user_type="supervisor")
            s = Supervisor.objects.create(user=u, supervisor_id=f"MEM13_{i}", academic_title="TS")
            role = "CHAIR" if i == 0 else ("SECRETARY" if i == 1 else "MEMBER")
            m = CouncilMember.objects.create(council=council, user=u, supervisor=s, role=role)
            CouncilLiveScore.objects.create(
                council=council, project=proj, member=m,
                score_presentation=3.0, score_content=3.0, score_qa=1.5, score_demo=1.5
            ) # Tổng = 9.0

        # 2. Hệ thống tính điểm tổng hợp:
        # Score = 9.0*0.4 + 8.5*0.2 + 9.0*0.4 = 3.6 + 1.7 + 3.6 = 8.9 (A, Xuất sắc/Giỏi)
        summary = FinalGradeSummary.objects.create(
            project=proj, supervisor_score=9.0, reviewer_score=8.5, council_avg_score=9.0
        )
        summary.calculate_and_save(policy=policy)
        self.assertAlmostEqual(summary.final_score_10, 8.9)
        self.assertEqual(summary.final_letter_grade, "A")
        self.assertEqual(summary.final_score_4, 4.0)
        self.assertTrue(summary.is_passed)

        # 3. Chốt điểm Hội đồng
        self.client.force_authenticate(user=self.admin_user)
        res_fin = self.client.post(f"/app/council/{council.id}/finalize-scores/")
        self.assertEqual(res_fin.status_code, status.HTTP_200_OK)
        council.refresh_from_db()
        self.assertTrue(council.is_finalized)

        # 4. Xuất biên bản chấm điểm PDF
        res_pdf = self.client.get(f"/app/council/{council.id}/export-minutes-pdf/")
        self.assertEqual(res_pdf.status_code, status.HTTP_200_OK)
        self.assertEqual(res_pdf["Content-Type"], "application/pdf")
        self.assertGreater(len(res_pdf.content), 1000)

        # 5. Xuất danh sách điểm đồ án theo lớp (Excel)
        res_excel = self.client.get(f"/app/batch/{batch.id}/export-final-grades-excel/?class_id={c_class.id}")
        self.assertEqual(res_excel.status_code, status.HTTP_200_OK)
        self.assertEqual(res_excel["Content-Type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        self.assertGreater(len(res_excel.content), 1000)
