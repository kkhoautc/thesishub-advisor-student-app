# QUY CHUẨN PHÁT TRIỂN & CHỈ THỊ HOẠT ĐỘNG CHO AGENT (AGENT DIRECTIVES)

Hệ thống Quản lý Đồ án Tốt nghiệp Thông minh ThesisHub (UTC) bao gồm 2 kho mã nguồn (workspaces) liên kết chặt chẽ và dùng chung một cơ sở dữ liệu **Neon PostgreSQL**:
- `/smart-fyp-management`: Cổng thông tin Sinh viên & Giảng viên hướng dẫn (Client Portal).
- `/Smart-Fyp-Admin`: Cổng thông tin Quản trị viên Khoa & Ban chủ nhiệm (Admin Portal).

---

## 🚫 1. NGUYÊN TẮC BẤT BIẾN: CẤM TẠO THÊM BẢNG VÀO DATABASE (STRICT ZERO-NEW-TABLE POLICY)

> [!CAUTION]
> **ĐIỀU KHOẢN BẮT BUỘC ĐỐI VỚI MỌI AGENT:**
> Cơ sở dữ liệu đã được **CHỐT CỐ ĐỊNH VÀ ĐÓNG BĂNG (FROZEN SCHEMA)** với đúng **25 Models Nghiệp vụ Pure UTC Schema**.
> 
> ❌ **TUYỆT ĐỐI KHÔNG ĐƯỢC TẠO THÊM BẤT KỲ BẢNG MỚI NÀO NỮA!**
> - Không được tạo class `Model` mới trong `backend/app/models.py`.
> - Không được tạo hay chạy migration tạo bảng mới (`makemigrations` / `migrate` DDL CREATE TABLE).
> - Không được tạo bảng trung gian mới hoặc bảng phụ ngoài danh mục 25 bảng nghiệp vụ bên dưới.
> - Mọi tính năng nghiệp vụ mới hoặc logic mở rộng sau này **BẮT BUỘC PHẢI TẬN DỤNG VÀ ÁNH XẠ TRÊN 25 BẢNG ĐÃ CÓ SẴN**.

---

## 📋 2. DANH MỤC 25 BẢNG NGHIỆP VỤ CỐ ĐỊNH CHUẨN UTC

Toàn bộ hệ thống hoạt động hoàn toàn trên đúng 25 thực thể nghiệp vụ sau:

| STT | Tên bảng CSDL | Model Django | Phạm vi nghiệp vụ |
| :---: | :--- | :--- | :--- |
| **01** | `app_academicbatch` | `AcademicBatch` | Quản lý đợt đồ án tốt nghiệp, giai đoạn đợt |
| **02** | `app_department` | `Department` | Bộ môn quản lý (CNPM, HTTT, KHMT, MMT) |
| **03** | `app_projecttopicarea` | `ProjectTopicArea` | Hướng nghiên cứu & Lĩnh vực đề tài |
| **04** | `app_evaluationpolicy` | `EvaluationPolicy` | Quy chế trọng số điểm (GVHD 40% - GVPB 20% - HĐ 40%) |
| **05** | `app_customuser` | `CustomUser` | Tài khoản người dùng (Admin, GVHD, SV) |
| **06** | `app_courseclass` | `CourseClass` | Lớp học phần / Lớp sinh hoạt |
| **07** | `app_supervisor` | `Supervisor` | Thông tin giảng viên hướng dẫn & học vị |
| **08** | `app_supervisorquota` | `SupervisorQuota` | Hạn mức chỉ tiêu hướng dẫn theo hệ số học vị |
| **09** | `app_student` | `Student` | Thông tin sinh viên, CPA, hệ đào tạo Kỹ sư / Cử nhân |
| **10** | `app_studentpreference` | `StudentPreference` | Khảo sát 3 nguyện vọng giảng viên NV1, NV2, NV3 |
| **11** | `app_internshipinfo` | `InternshipInfo` | Thông tin khảo sát thực tập doanh nghiệp của SV |
| **12** | `app_graduationproject` | `GraduationProject` | Hồ sơ đề tài đồ án tốt nghiệp chính thức |
| **13** | `app_supervisionmeetinglog`| `SupervisionMeetingLog` | Nhật ký các buổi họp hướng dẫn định kỳ |
| **14** | `app_supervisiontask` | `SupervisionTask` | Nhiệm vụ / Task do GVHD giao cho sinh viên |
| **15** | `app_weeklyprogressreport`| `WeeklyProgressReport` | Báo cáo tiến độ đồ án nộp định kỳ hàng tuần |
| **16** | `app_thesisdeferralrequest`| `ThesisDeferralRequest` | Đơn xin bảo lưu đồ án của sinh viên |
| **17** | `app_outlinereviewgroup` | `OutlineReviewGroup` | Nhóm/tiểu ban duyệt đề cương |
| **18** | `app_outlinereview` | `OutlineReview` | Đánh giá & nhận xét đề cương đồ án |
| **19** | `app_defensecouncil` | `DefenseCouncil` | Hội đồng đánh giá bảo vệ đồ án (chuẩn UTC 5 người) |
| **20** | `app_councilmember` | `CouncilMember` | Thành viên hội đồng (1 Chủ tịch, 2 Thư ký, 2 Ủy viên) |
| **21** | `app_defensescheduleslot` | `DefenseScheduleSlot` | Lịch bảo vệ chi tiết từng slot (10-12 SV/buổi) |
| **22** | `app_councillivescore` | `CouncilLiveScore` | Điểm chấm trực tiếp của từng thành viên hội đồng |
| **23** | `app_finalgradesummary` | `FinalGradeSummary` | Tổng kết điểm cuối kỳ (thang 10, thang 4, điểm chữ) |
| **24** | `app_auditlog` | `AuditLog` | Nhật ký kiểm toán thao tác hệ thống |
| **25** | `app_notification` | `Notification` | Thông báo hệ thống cho người dùng |

*(Kèm theo 3 bảng Many-to-Many trung gian của Django: `app_customuser_groups`, `app_customuser_user_permissions`, `app_outlinereviewgroup_members` và các bảng hạ tầng mặc định của Django/SimpleJWT).*

---

## ⚙️ 3. QUY TẮC PHÁT TRIỂN & ĐỒNG BỘ HAI WORKSPACE

1. **Đồng bộ song hành Client & Admin**:
   - Khi sửa đổi logic hoặc tạo API mới ở Backend, phải kiểm tra và cập nhật giao diện React ở **CẢ HAI** thư mục (`smart-fyp-management` và `Smart-Fyp-Admin`).
   - Tuyệt đối không thêm tính năng ở Client mà bỏ quên màn hình quản lý ở Admin hoặc ngược lại.

2. **Dữ liệu mẫu & Xác thực**:
   - Giữ nguyên các tài khoản kiểm thử chuẩn đã xác thực (`admin`, `ts_thang`, `pgs_ha`, `ths_linh`, `sv_an`, `sv_hung`...).
   - Đảm bảo tính năng **1-Click Auto-Fill (Điền mẫu)** trên cả hai giao diện đăng nhập hoạt động trơn tru.

3. **Môi trường & Cổng chạy dịch vụ**:
   - Client Frontend: `http://localhost:3000`
   - Admin Frontend: `http://localhost:5174`
   - Client Backend: `http://localhost:8000`
   - Admin Backend: `http://localhost:8001`
   - Database: Neon PostgreSQL dùng chung qua biến môi trường `DATABASE_URL`.

### 4. Các Nguyên Tắc Bất Biến Cần TUYỆT ĐỐI Tuân Thủ
1. Nguyên Tắc Cốt Lõi (Core Principles)
DRY (Don't Repeat Yourself) là ưu tiên số 1: Không bao giờ viết mới những gì đã tồn tại. Luôn tìm kiếm và tái sử dụng triệt để logic/hàm có sẵn trong codebase.

Tối giản & Hiệu năng cao: Ưu tiên code ngắn gọn, rõ nghĩa, hạn chế boilerplate code không cần thiết, tối ưu độ phức tạp thuật toán và tài nguyên hệ thống.

Tôn trọng cấu trúc hiện tại: Tuân thủ conventions, design patterns và kiến trúc thư mục vốn có của dự án.
2. Quy Tắc Cơ Sở Dữ Liệu (Database Restrictions)
Tuyệt đối không tự ý tạo bảng mới: Không được tự thêm table, migration tạo table mới hoặc thay đổi cấu trúc schema khi chưa có yêu cầu tường minh từ lập trình viên.

Tận dụng Schema sẵn có: Mọi logic truy vấn, lưu trữ dữ liệu phải dựa hoàn toàn trên các bảng và trường (fields) hiện tại.

Nếu bắt buộc phải đổi Schema: Cần dừng lại, giải thích rõ lý do kỹ thuật và xin xác nhận từ người dùng trước khi viết migration hay code schema.

3. Tái Sử Dụng & Tối Ưu Code (Reuse & Optimization)
Kiểm tra trước khi viết mới (Code Reuse First)

Trước khi triển khai bất kỳ hàm hoặc logic nghiệp vụ nào, bắt buộc phải quét/tìm kiếm trong dự án xem:

Đã có helper/utility function nào xử lý logic tương tự chưa (ví dụ: format ngày tháng, parse JSON, xử lý chuỗi, validate input, handle response/error...)?

Đã có custom hook, service, repository, hoặc query tương tự chưa?

Nếu có sẵn nhưng thiếu một nhánh logic nhỏ: Mở rộng (extend) hàm hiện có một cách an toàn thay vì viết một hàm mới trùng lặp.

Tiêu chuẩn viết code ngắn gọn & tối ưu (Clean & Concise Code)

Tránh viết code dài dòng: Loại bỏ các đoạn code lồng nhau phức tạp (nested blocks), áp dụng kỹ thuật Early Return / Guard Clauses.

Tận dụng tính năng hiện đại của ngôn ngữ: Sử dụng cú pháp ngắn gọn, an toàn (Optional Chaining, Nullish Coalescing, Destructuring, Pattern Matching, Stream API... tùy theo ngôn ngữ dự án).

Tối ưu truy vấn dữ liệu:

Chỉ SELECT các trường cần dùng, tuyệt đối tránh SELECT * bừa bãi.

Hạn chế tối đa lỗi $N+1$ query; sử dụng bulk insert/update và eager loading hợp lý.

Không chèn code thừa: Không sinh comment thừa thãi mô tả những điều hiển nhiên; không để lại dead code hoặc biến không sử dụng.

4. Quy Trình Thực Thi Của AI (Step-by-Step Workflow)
Khi nhận một task, AI phải tuân thủ nghiêm ngặt 3 bước sau:

Bước 1 - Khảo sát Codebase:

Tìm kiếm các hàm, file utils, component liên quan đã có trong dự án.

Xác định xem tính năng mới có thể lắp ghép từ các khối code sẵn có hay không.

Bước 2 - Lên giải pháp tối giản:

Chọn cách tiếp cận tốn ít dòng code nhất nhưng đảm bảo performance và tính dễ bảo trì.

Đảm bảo không đụng chạm đến việc tạo bảng database mới.

Bước 3 - Triển khai & Tinh gọn:

Viết code súc tích, tái sử dụng các module đã khảo sát ở Bước 1.