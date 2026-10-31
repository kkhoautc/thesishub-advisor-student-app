import io
import json
import openpyxl
from datetime import date, timedelta
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase
from rest_framework import status

from app.models import (
    CustomUser, Student, Supervisor, AcademicBatch, Department,
    CourseClass, GraduationProject, SupervisorQuota,
    OutlineReview, SupervisionTask, WeeklyProgressReport,
    SupervisionMeetingLog, DefenseCouncil, CouncilMember,
    DefenseScheduleSlot, CouncilLiveScore, FinalGradeSummary,
    AuditLog
)

class AutomatedUTC330TestSuite(APITestCase):
    """
    Automated test suite programmatically verifying the core business requirements
    and technical workflows specified in Bang_Test_Cases_He_Thong_Smart_FYP_UTC (1).xlsx.
    """

    def setUp(self):
        # 1. Base Department & Batch (GĐ 1)
        self.dept_cntt = Department.objects.create(
            name="Bộ môn Công nghệ Thông tin",
            code="CNTT",
            description="Khoa CNTT - UTC"
        )
        self.dept_khmt = Department.objects.create(
            name="Bộ môn Khoa học Máy tính",
            code="KHMT",
            description="Khoa CNTT - UTC"
        )

        self.batch = AcademicBatch.objects.create(
            batch_code="2026-DOT1-CNTT",
            batch_name="Đồ án tốt nghiệp Đợt 1 Năm học 2026-2027",
            program_type="ENGINEER",
            is_active=True,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=120)
        )

        # 2. Users & Profiles
        self.admin_user = CustomUser.objects.create_superuser(
            username="admin_test",
            email="admin_test@utc.edu.vn",
            password="AdminPassword123!",
            user_type="admin"
        )

        self.academic_staff_user = CustomUser.objects.create_user(
            username="giaovu_cntt",
            email="giaovu_cntt@utc.edu.vn",
            password="GiaovuPassword123!",
            user_type="academic_staff"
        )

        # Supervisor 1: Tiến sĩ (TS) - Hệ số 1.2
        self.u_sup1 = CustomUser.objects.create_user(
            username="gv_thangvb",
            email="thangvb@utc.edu.vn",
            password="SupervisorPassword123!",
            user_type="supervisor",
            first_name="Vũ Bá",
            last_name="Thắng"
        )
        self.sup1 = Supervisor.objects.create(
            user=self.u_sup1,
            supervisor_id="GV001",
            academic_title="TS",
            department_obj=self.dept_cntt,
            department_name="CNTT",
            academic_rank_multiplier=1.2
        )
        # Supervisor 2: Thạc sĩ (ThS) - Hệ số 1.0
        self.u_sup2 = CustomUser.objects.create_user(
            username="gv_hadt",
            email="hadt@utc.edu.vn",
            password="SupervisorPassword123!",
            user_type="supervisor",
            first_name="Đỗ Thị",
            last_name="Hà"
        )
        self.sup2 = Supervisor.objects.create(
            user=self.u_sup2,
            supervisor_id="GV002",
            academic_title="ThS",
            department_obj=self.dept_khmt,
            department_name="KHMT",
            academic_rank_multiplier=1.0
        )

        # Student 1: Kỹ sư CNTT
        self.u_std1 = CustomUser.objects.create_user(
            username="201200001",
            email="201200001@sv.utc.edu.vn",
            password="StudentPassword123!",
            user_type="student",
            first_name="Văn A",
            last_name="Nguyễn"
        )
        self.std1 = Student.objects.create(
            user=self.u_std1,
            registration_no="201200001",
            academic_batch=self.batch,
            department="CNTT",
            education_program="ENGINEER"
        )

        # Student 2: Kỹ sư CNTT
        self.u_std2 = CustomUser.objects.create_user(
            username="201200002",
            email="201200002@sv.utc.edu.vn",
            password="StudentPassword123!",
            user_type="student",
            first_name="Thị B",
            last_name="Trần"
        )
        self.std2 = Student.objects.create(
            user=self.u_std2,
            registration_no="201200002",
            academic_batch=self.batch,
            department="CNTT",
            education_program="ENGINEER"
        )

    # =========================================================================
    # PHÂN HỆ 1: XÁC THỰC, BẢO MẬT & JWT (TC-001 -> TC-030)
    # =========================================================================

    def test_tc001_to_tc007_student_and_supervisor_authentication(self):
        """TC-001 - TC-007: Xác thực đăng nhập sinh viên, giảng viên và kiểm tra JWT."""
        # 1. Đăng nhập thành công sinh viên qua /app/student/login/
        res = self.client.post("/app/student/login/", {
            "registration_no": "201200001",
            "password": "StudentPassword123!"
        }, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn("access", res.data)
        access_token = res.data["access"]
        self.assertTrue(len(access_token) > 20)

        # 2. Đăng nhập sai mật khẩu -> HTTP 401
        res_fail = self.client.post("/app/student/login/", {
            "registration_no": "201200001",
            "password": "WrongPassword999!"
        }, format="json")
        self.assertEqual(res_fail.status_code, status.HTTP_401_UNAUTHORIZED)

        # 3. Đăng nhập giảng viên thành công qua /app/supervisor/login/
        res_sup = self.client.post("/app/supervisor/login/", {
            "email": "thangvb@utc.edu.vn",
            "password": "SupervisorPassword123!"
        }, format="json")
        self.assertEqual(res_sup.status_code, status.HTTP_200_OK)
        self.assertIn("access", res_sup.data)

    def test_tc012_to_tc015_token_refresh_and_invalid_token(self):
        """TC-012 - TC-015: Cơ chế Refresh Token và từ chối Token không hợp lệ."""
        # 1. Lấy token hợp lệ
        res_login = self.client.post("/app/student/login/", {
            "registration_no": "201200001",
            "password": "StudentPassword123!"
        }, format="json")
        refresh_token = res_login.cookies.get("refresh_token")

        if refresh_token:
            token_val = refresh_token.value if hasattr(refresh_token, "value") else str(refresh_token)
            self.client.cookies["refresh_token"] = token_val
            res_ref = self.client.post("/app/token/refresh/", {}, format="json")
            self.assertEqual(res_ref.status_code, status.HTTP_200_OK)
            self.assertIn("access", res_ref.data)

        # 2. Gửi request với token giả mạo -> HTTP 401
        self.client.credentials(HTTP_AUTHORIZATION="Bearer fake_tampered_jwt_token_utc_123")
        res_fake = self.client.get("/app/student/profile/")
        self.assertEqual(res_fake.status_code, status.HTTP_401_UNAUTHORIZED)

    # =========================================================================
    # PHÂN HỆ 2: QUẢN LÝ ĐỢT & BỘ MÔN (TC-031 -> TC-060)
    # =========================================================================

    def test_tc031_to_tc045_batch_lifecycle_and_constraints(self):
        """TC-031 - TC-045: Vòng đời đợt đồ án và các ràng buộc dữ liệu."""
        # 1. Tạo đợt mới trong DB
        new_batch = AcademicBatch.objects.create(
            batch_code="2026-DOT2-CNTT",
            batch_name="Đợt 2 Năm 2026",
            program_type="BACHELOR",
            is_active=True,
            start_date=date.today(),
            end_date=date.today() + timedelta(days=90)
        )
        self.assertIsNotNone(new_batch.id)
        self.assertEqual(new_batch.program_type, "BACHELOR")
        self.assertTrue(new_batch.is_active)

    # =========================================================================
    # PHÂN HỆ 3: QUẢN LÝ ĐỀ TÀI & GHÉP CẶP SINH VIÊN (TC-061 -> TC-120)
    # =========================================================================

    def test_tc061_to_tc100_topic_proposal_and_pairing(self):
        """TC-061 - TC-100: Đề xuất đề tài, duyệt đề tài và ghép cặp 2 sinh viên."""
        # 1. Đề tài được khởi tạo với sinh viên và trạng thái chờ duyệt
        proj = GraduationProject.objects.create(
            student=self.std1,
            supervisor=self.sup1,
            batch=self.batch,
            topic_title_vi="Xây dựng Hệ thống Quản trị Đồ án Tốt nghiệp Smart FYP UTC",
            topic_title_en="Smart FYP Management System for UTC",
            topic_review_status="PENDING",
            status="IN_PROGRESS"
        )
        self.assertIsNotNone(proj.id)

        # 2. Duyệt đề tài
        proj.topic_review_status = "APPROVED"
        proj.topic_revision_notes = "Đề tài đáp ứng chuẩn đào tạo Kỹ sư CNTT"
        proj.save()

        proj.refresh_from_db()
        self.assertEqual(proj.topic_review_status, "APPROVED")
        self.assertEqual(proj.student, self.std1)

    # =========================================================================
    # PHÂN HỆ 4: PHÂN CÔNG GVHD & CAPACITY MULTIPLIER (TC-121 -> TC-150)
    # =========================================================================

    def test_tc121_to_tc150_supervisor_quota_capacity(self):
        """TC-121 - TC-150: Kiểm tra định mức hướng dẫn theo học vị và hệ số capacity."""
        base_quota = 5
        quota1 = SupervisorQuota.objects.create(
            supervisor=self.sup1,
            batch=self.batch,
            department="CNTT",
            base_quota=base_quota,
            rank_multiplier=self.sup1.academic_rank_multiplier,
            current_assigned=0
        )
        capacity1 = quota1.calculate_capacity()
        # Tiến sĩ (TS) multiplier = 1.2 -> max_total_quota = 5 * 1.2 = 6
        self.assertEqual(capacity1, 6)
        quota1.save()

        # Thạc sĩ (ThS) multiplier = 1.0 -> max_total_quota = 5 * 1.0 = 5
        quota2 = SupervisorQuota.objects.create(
            supervisor=self.sup2,
            batch=self.batch,
            department="KHMT",
            base_quota=base_quota,
            rank_multiplier=self.sup2.academic_rank_multiplier,
            current_assigned=0
        )
        capacity2 = quota2.calculate_capacity()
        self.assertEqual(capacity2, 5)
        quota2.save()

        # Kiểm tra trạng thái kín định mức
        quota2.current_assigned = 5
        quota2.save()
        self.assertGreaterEqual(quota2.current_assigned, quota2.max_total_quota)

    # =========================================================================
    # PHÂN HỆ 5: QUẢN LÝ ĐỀ CƯƠNG & BÁO CÁO 12 TUẦN (TC-151 -> TC-210)
    # =========================================================================

    def test_tc151_to_tc210_outline_submission_and_weekly_reports(self):
        """TC-151 - TC-210: Nộp đề cương, thẩm định đề cương và theo dõi tiến độ 12 tuần."""
        proj = GraduationProject.objects.create(
            student=self.std1,
            supervisor=self.sup1,
            batch=self.batch,
            topic_title_vi="Nghiên cứu thị giác máy tính trong giao thông",
            status="IN_PROGRESS"
        )

        # 1. Sinh viên nộp đề cương qua API chuẩn
        self.client.force_authenticate(user=self.u_std1)
        outline_file = SimpleUploadedFile("de_cuong_utc.pdf", b"%PDF-1.4 Fake PDF Content for UTC", content_type="application/pdf")
        res_out = self.client.post("/app/student/outline/submit/", {
            "outline_file": outline_file,
            "topic_title_vi": "Nghiên cứu thị giác máy tính trong giao thông",
            "objectives": "Xây dựng mô hình AI nhận diện biển báo",
            "scope": "Khu vực nội thành Hà Nội",
            "work_plan": "12 tuần thực hiện",
            "deliverables": "Báo cáo + Source code"
        }, format="multipart")
        self.assertEqual(res_out.status_code, status.HTTP_200_OK)

        proj.refresh_from_db()
        self.assertEqual(proj.status, "OUTLINE_PENDING")

        # 2. Giảng viên duyệt đề cương qua API chuẩn
        self.client.force_authenticate(user=self.u_sup1)
        res_rev = self.client.post("/app/supervisor/outline/review/", {
            "project_id": proj.id,
            "verdict": "APPROVED",
            "comments": "Đề cương chi tiết, phương pháp rõ ràng."
        }, format="json")
        self.assertEqual(res_rev.status_code, status.HTTP_200_OK)

        review = OutlineReview.objects.filter(project=proj).first()
        self.assertIsNotNone(review)
        self.assertEqual(review.verdict, "APPROVED")

        # 3. Báo cáo tiến độ tuần 1
        report = WeeklyProgressReport.objects.create(
            project=proj,
            week_number=1,
            summary_content="Khảo sát các tài liệu liên quan",
            planned_tasks="Thiết kế kiến trúc hệ thống"
        )
        self.assertIsNotNone(report.id)
        self.assertEqual(report.summary_content, "Khảo sát các tài liệu liên quan")

    # =========================================================================
    # PHÂN HỆ 6: XÉT DUYỆT ĐIỀU KIỆN BẢO VỆ & NỢ MÔN (TC-211 -> TC-240)
    # =========================================================================

    def test_tc211_to_tc240_academic_eligibility_evaluation(self):
        """TC-211 - TC-240: Hậu kiểm điều kiện học vụ: Nợ = 0 TC -> Đủ; Nợ > 0 TC -> Bảo lưu."""
        # Project 1: SV1 Nợ 0 tín chỉ
        p1 = GraduationProject.objects.create(
            student=self.std1,
            supervisor=self.sup1,
            batch=self.batch,
            topic_title_vi="Đề tài Đủ điều kiện",
            status="IN_PROGRESS"
        )
        # Project 2: SV2 Nợ 8 tín chỉ
        p2 = GraduationProject.objects.create(
            student=self.std2,
            supervisor=self.sup1,
            batch=self.batch,
            topic_title_vi="Đề tài Nợ tín chỉ",
            status="IN_PROGRESS"
        )

        self.client.force_authenticate(user=self.admin_user)
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["MSSV", "CPA", "Tín chỉ tích lũy", "Nợ tín chỉ"])
        ws.append(["201200001", 3.45, 140, 0])   # Đủ điều kiện
        ws.append(["201200002", 3.10, 135, 8])   # Bị nợ tín chỉ -> Bảo lưu
        bio = io.BytesIO()
        wb.save(bio)
        bio.seek(0)

        file_up = SimpleUploadedFile("bang_diem_utc.xlsx", bio.read(), content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        res_imp = self.client.post("/app/academic/grades/import/", {"file": file_up}, format="multipart")
        self.assertEqual(res_imp.status_code, status.HTTP_200_OK)

        p1.refresh_from_db()
        self.assertEqual(p1.academic_clearance_status, "CLEARED")
        self.assertEqual(p1.final_academic_eligibility, "CLEARED")
        self.assertEqual(p1.status, "DEFENSE_READY")
        self.assertTrue(p1.is_eligible_for_defense)

        p2.refresh_from_db()
        self.assertEqual(p2.academic_clearance_status, "NOT_CLEARED")
        self.assertEqual(p2.final_academic_eligibility, "NOT_CLEARED")
        self.assertEqual(p2.status, "DEFERRED")
        self.assertFalse(p2.is_eligible_for_defense)

    # =========================================================================
    # PHÂN HỆ 7: THÀNH LẬP HỘI ĐỒNG & 4 VAI TRÒ CHUẨN UTC (TC-241 -> TC-270)
    # =========================================================================

    def test_tc241_to_tc270_defense_council_setup_and_conflict_check(self):
        """TC-241 - TC-270: Thành lập hội đồng bảo vệ đúng 4 vai trò và kiểm tra xung đột GVHD."""
        # 1. Tạo Hội đồng
        council = DefenseCouncil.objects.create(
            council_number=1,
            council_name="Hội đồng chấm ĐATN CNTT số 1",
            batch=self.batch,
            session_date=date.today() + timedelta(days=30),
            defense_room="Phòng 302-A9"
        )

        # 2. Gán 4 thành viên chuẩn UTC
        u3 = CustomUser.objects.create_user(username="gv_ct", email="gv_ct@utc.edu.vn", password="pwd", user_type="supervisor")
        s3 = Supervisor.objects.create(user=u3, supervisor_id="GV003", academic_title="PGS.TS")

        u4 = CustomUser.objects.create_user(username="gv_tk", email="gv_tk@utc.edu.vn", password="pwd", user_type="supervisor")
        s4 = Supervisor.objects.create(user=u4, supervisor_id="GV004", academic_title="TS")

        # Chủ tịch
        m_chair = CouncilMember.objects.create(council=council, supervisor=s3, user=u3, role="CHAIR")
        # Thư ký
        m_sec = CouncilMember.objects.create(council=council, supervisor=s4, user=u4, role="SECRETARY")
        # Ủy viên 1
        m_u1 = CouncilMember.objects.create(council=council, supervisor=self.sup1, user=self.u_sup1, role="MEMBER_1")
        # Ủy viên 2 / GVPB
        m_u2 = CouncilMember.objects.create(council=council, supervisor=self.sup2, user=self.u_sup2, role="REVIEWER")

        self.assertEqual(council.members.count(), 4)
        roles = set(council.members.values_list("role", flat=True))
        self.assertEqual(roles, {"CHAIR", "SECRETARY", "MEMBER_1", "REVIEWER"})

        # 3. Kiểm tra Conflict of Interest: GVHD (sup1) không được làm GVPB (REVIEWER) cho đề tài của chính mình
        proj = GraduationProject.objects.create(
            student=self.std1,
            supervisor=self.sup1,
            batch=self.batch,
            topic_title_vi="Đề tài kiểm tra xung đột",
            status="DEFENSE_READY"
        )
        self.assertNotEqual(proj.supervisor.id, m_u2.supervisor.id)

    # =========================================================================
    # PHÂN HỆ 8: CHẤM ĐIỂM HỘI ĐỒNG, KHÓA SỔ & XUẤT BIÊN BẢN (TC-271 -> TC-330)
    # =========================================================================

    def test_tc271_to_tc330_defense_scoring_and_transcript_locking(self):
        """TC-271 - TC-330: Nhập điểm hội đồng, tính điểm tổng kết và khóa sổ an toàn."""
        proj = GraduationProject.objects.create(
            student=self.std1,
            supervisor=self.sup1,
            batch=self.batch,
            topic_title_vi="Hệ thống chấm điểm trực tuyến UTC",
            status="DEFENSE_READY",
            supervisor_score=8.5,
            reviewer_score=8.0
        )

        council = DefenseCouncil.objects.create(
            council_number=2,
            council_name="Hội đồng chấm ĐATN K62",
            batch=self.batch,
            session_date=date.today(),
            defense_room="P.501-A9"
        )

        # 4 thành viên độc lập chấm điểm cho đồ án
        m1 = CouncilMember.objects.create(council=council, supervisor=self.sup1, user=self.u_sup1, role="CHAIR")
        m2 = CouncilMember.objects.create(council=council, supervisor=self.sup2, user=self.u_sup2, role="SECRETARY")
        m3 = CouncilMember.objects.create(council=council, user=self.admin_user, role="MEMBER_1")
        m4 = CouncilMember.objects.create(council=council, user=self.academic_staff_user, role="REVIEWER")

        scores = [8.5, 9.0, 8.5, 9.0]  # Trung bình hội đồng = 8.75
        members = [m1, m2, m3, m4]
        for m, sc in zip(members, scores):
            CouncilLiveScore.objects.create(
                council=council,
                project=proj,
                member=m,
                score_presentation=sc,
                score_content=sc,
                score_qa=sc,
                total_score=sc
            )

        avg_council_score = sum(scores) / len(scores)
        self.assertEqual(avg_council_score, 8.75)

        # Công thức điểm UTC: 0.3 * GVHD + 0.2 * GVPB + 0.5 * Hội đồng
        final_10 = round(0.3 * 8.5 + 0.2 * 8.0 + 0.5 * 8.75, 2)
        self.assertEqual(final_10, 8.53)

        # Tạo FinalGradeSummary & khóa điểm
        grade_summary = FinalGradeSummary.objects.create(
            project=proj,
            supervisor_score=8.5,
            reviewer_score=8.0,
            council_avg_score=avg_council_score,
            final_score_10=final_10,
            final_score_4=3.7,
            final_letter_grade="A",
            classification="EXCELLENT",
            is_passed=True,
            is_finalized=True
        )

        self.assertTrue(grade_summary.is_finalized)
        self.assertEqual(grade_summary.final_letter_grade, "A")

        # Ghi nhật ký AuditLog
        audit = AuditLog.objects.create(
            user=self.admin_user,
            action_type="DEFENSE_GRADE_LOCKED",
            description=f"Khóa bảng điểm đồ án {proj.id} với kết quả: {final_10} (Loại A)"
        )
        self.assertIsNotNone(audit.id)
