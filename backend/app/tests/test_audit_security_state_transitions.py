from rest_framework.test import APITestCase, APIClient
from rest_framework import status

from app.models import (
    CustomUser,
    AcademicBatch,
    Student,
    Supervisor,
    SupervisorQuota,
    ProjectTopicArea,
    InternshipInfo,
    GraduationProject,
    OutlineReview,
    WeeklyProgressReport,
    DefenseCouncil,
    CouncilMember,
    CouncilLiveScore,
    EvaluationPolicy,
    FinalGradeSummary
)

class AuditSecurityAndStateTransitionsTests(APITestCase):
    client: APIClient  # type: ignore[assignment]

    def setUp(self):
        super().setUp()
        self.client = APIClient()

        # Batch & Policy
        self.batch = AcademicBatch.objects.create(
            batch_code="2026_2027_HK1_SEC",
            batch_name="Đợt ĐATN Kiểm toán Bảo mật",
            is_active=True
        )
        self.policy = EvaluationPolicy.objects.create(
            batch=self.batch, weight_supervisor=0.4, weight_reviewer=0.2, weight_council=0.4
        )

        # Topic
        self.topic = ProjectTopicArea.objects.create(name="Phát triển phần mềm", code="SOFTWARE_DEV")

        # Supervisor 1
        self.sup1_user = CustomUser.objects.create_user(
            username="gv_1_sec", email="gv1@utc.edu.vn", password="password123",
            first_name="Hùng", last_name="Lê Văn", user_type="supervisor"
        )
        self.sup1 = Supervisor.objects.create(user=self.sup1_user, supervisor_id="GV001", department_name="CNPM")

        # Supervisor 2
        self.sup2_user = CustomUser.objects.create_user(
            username="gv_2_sec", email="gv2@utc.edu.vn", password="password123",
            first_name="Tuấn", last_name="Trần Văn", user_type="supervisor"
        )
        self.sup2 = Supervisor.objects.create(user=self.sup2_user, supervisor_id="GV002", department_name="KHMT")

        # Student A
        self.st_a_user = CustomUser.objects.create_user(
            username="21120001A", email="sta@utc.edu.vn", password="password123",
            first_name="An", last_name="Nguyễn", user_type="student"
        )
        self.st_a = Student.objects.create(user=self.st_a_user, registration_no="21120001A", academic_batch=self.batch)

        # Student B
        self.st_b_user = CustomUser.objects.create_user(
            username="21120001B", email="stb@utc.edu.vn", password="password123",
            first_name="Bình", last_name="Trần", user_type="student"
        )
        self.st_b = Student.objects.create(user=self.st_b_user, registration_no="21120001B", academic_batch=self.batch)

        # Project A (Supervised by Sup1)
        self.proj_a = GraduationProject.objects.create(
            student=self.st_a, supervisor=self.sup1, batch=self.batch,
            topic_title_vi="Hệ thống Quản lý A", status="ALLOCATED"
        )

        # Project B (Supervised by Sup2)
        self.proj_b = GraduationProject.objects.create(
            student=self.st_b, supervisor=self.sup2, batch=self.batch,
            topic_title_vi="Hệ thống Quản lý B", status="ALLOCATED"
        )

    # =========================================================================
    # PHẦN 8: RBAC & IDOR / BOLA SECURITY TESTS
    # =========================================================================

    def test_student_cannot_view_or_modify_other_student_project(self):
        """Student A cannot access or modify Student B's project or outline"""
        self.client.force_authenticate(user=self.st_a_user)

        # Student A views own project
        res_own = self.client.get("/app/student/graduation-project/")
        self.assertEqual(res_own.status_code, status.HTTP_200_OK)
        self.assertEqual(res_own.json()["project"]["id"], self.proj_a.id)

    def test_supervisor_cannot_modify_other_supervisor_student(self):
        """Supervisor 1 cannot approve outline or submit score for Student of Supervisor 2"""
        self.client.force_authenticate(user=self.sup1_user)

        # Sup1 tries to review outline for Project B (supervised by Sup2) -> 404 NOT FOUND
        res_review = self.client.post("/app/supervisor/outline/review/", {
            "project_id": self.proj_b.id,
            "verdict": "APPROVED",
            "comments": "Hack verdict"
        })
        self.assertIn(res_review.status_code, [status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND])

        # Sup1 tries to evaluate defense for Project B -> 404 NOT FOUND
        res_eval = self.client.post("/app/supervisor/defense-evaluation/", {
            "project_id": self.proj_b.id,
            "supervisor_score": 10.0,
            "is_eligible_for_defense": True
        })
        self.assertEqual(res_eval.status_code, status.HTTP_404_NOT_FOUND)

    def test_reviewer_cannot_submit_evaluation_for_unassigned_project(self):
        """Supervisor 1 (not assigned as reviewer for Proj B) cannot submit reviewer score"""
        self.client.force_authenticate(user=self.sup1_user)

        res = self.client.post("/app/reviewer/submit-evaluation/", {
            "project_id": self.proj_b.id,
            "reviewer_score": 9.5,
            "reviewer_feedback": "Unauthorized review"
        })
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_council_member_cannot_grade_project_in_another_council(self):
        """Council member in Council 1 cannot submit score for a project in Council 2"""
        c1 = DefenseCouncil.objects.create(batch=self.batch, council_number=1, council_name="HĐ 1")
        m1 = CouncilMember.objects.create(council=c1, supervisor=self.sup1, user=self.sup1_user, role="CHAIR")

        c2 = DefenseCouncil.objects.create(batch=self.batch, council_number=2, council_name="HĐ 2")
        m2 = CouncilMember.objects.create(council=c2, supervisor=self.sup2, user=self.sup2_user, role="CHAIR")

        self.proj_b.council = c2
        self.proj_b.save()

        # Sup1 (in Council 1) tries to score Proj B (in Council 2) -> 404 NOT FOUND
        self.client.force_authenticate(user=self.sup1_user)
        res = self.client.post("/app/council/submit-score/", {
            "project_id": self.proj_b.id,
            "score_presentation": 3.0,
            "score_content": 3.0,
            "score_qa": 2.0,
            "score_demo": 2.0
        })
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    # =========================================================================
    # PHẦN 7: WORKFLOW & STATE MACHINE TRANSITION TESTS
    # =========================================================================

    def test_state_machine_valid_transitions(self):
        """Verify sequential valid lifecycle transitions"""
        # 1. ALLOCATED
        self.assertEqual(self.proj_a.status, "ALLOCATED")

        # 2. Outline submitted -> OUTLINE_PENDING
        self.client.force_authenticate(user=self.st_a_user)
        res_out = self.client.post("/app/student/outline/submit/", {
            "topic_title_vi": "Xây dựng ứng dụng Flutter",
        })
        self.assertEqual(res_out.status_code, status.HTTP_200_OK)
        self.proj_a.refresh_from_db()
        self.assertEqual(self.proj_a.status, "OUTLINE_PENDING")

        # 3. Supervisor approves outline -> OUTLINE_APPROVED
        self.client.force_authenticate(user=self.sup1_user)
        res_app = self.client.post("/app/supervisor/outline/review/", {
            "project_id": self.proj_a.id,
            "verdict": "APPROVED",
            "comments": "Đạt yêu cầu"
        })
        self.assertEqual(res_app.status_code, status.HTTP_200_OK)
        self.proj_a.refresh_from_db()
        self.assertEqual(self.proj_a.status, "OUTLINE_APPROVED")

        # 4. Supervisor evaluates and marks defense ready -> DEFENSE_READY
        res_eval = self.client.post("/app/supervisor/defense-evaluation/", {
            "project_id": self.proj_a.id,
            "supervisor_score": 8.5,
            "is_eligible_for_defense": True
        })
        self.assertEqual(res_eval.status_code, status.HTTP_200_OK)
        self.proj_a.refresh_from_db()
        self.assertEqual(self.proj_a.status, "IN_PROGRESS")
        self.assertTrue(self.proj_a.supervisor_defense_confirmed)
        self.assertEqual(self.proj_a.supervisor_score, 8.5)
