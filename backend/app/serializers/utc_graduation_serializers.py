from rest_framework import serializers
from ..models import (
    Supervisor,
    ProjectTopicArea,
    InternshipInfo,
    ProposedAllocation,
    GraduationProject,
    ThesisDeferralRequest,
    OutlineReview,
    WeeklyProgressReport,
    SupervisionMeetingLog,
    SupervisionTask,
    CouncilLiveScore,
    FinalGradeSummary,
    AcademicBatch,
)

class ProjectTopicAreaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectTopicArea
        fields = ["id", "name", "code", "description"]


class SupervisorBriefSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    department = serializers.CharField(source="department_name", read_only=True)
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.CharField(source="user.email", read_only=True)
    is_eligible_for_engineer = serializers.SerializerMethodField()

    class Meta:
        model = Supervisor
        fields = [
            "id",
            "supervisor_id",
            "full_name",
            "academic_title",
            "department",
            "phone_number",
            "username",
            "email",
            "is_external",
            "research_interest",
            "is_eligible_for_engineer",
        ]

    def get_full_name(self, obj):
        prefix = f"{obj.academic_title} " if obj.academic_title else ""
        return f"{prefix}{obj.user.get_full_name() or obj.user.username}".strip()

    def get_is_eligible_for_engineer(self, obj):
        title = obj.academic_title or ""
        doctoral_markers = ["TS", "TIẾN SĨ", "TIEN SI", "PGS", "GS", "GIÁO SƯ", "GIAO SU", "PHÓ GIÁO SƯ"]
        return any(marker in title.upper() for marker in doctoral_markers)


class InternshipInfoSerializer(serializers.ModelSerializer):
    topic_direction_name = serializers.CharField(source="topic_direction.name", read_only=True, default="")
    preferred_supervisor = serializers.SerializerMethodField()
    preferred_supervisor_name = serializers.SerializerMethodField()
    preference_1 = serializers.SerializerMethodField()
    preference_1_name = serializers.SerializerMethodField()
    preference_2 = serializers.SerializerMethodField()
    preference_2_name = serializers.SerializerMethodField()
    preference_3 = serializers.SerializerMethodField()
    preference_3_name = serializers.SerializerMethodField()
    secondary_criteria_note = serializers.SerializerMethodField()

    class Meta:
        model = InternshipInfo
        fields = [
            "id",
            "student",
            "batch",
            "is_interning",
            "company_name",
            "topic_direction",
            "topic_direction_name",
            "preferred_supervisor",
            "preferred_supervisor_name",
            "preference_1",
            "preference_1_name",
            "preference_2",
            "preference_2_name",
            "preference_3",
            "preference_3_name",
            "secondary_criteria_note",
            "tentative_title",
            "submitted_at"
        ]
        read_only_fields = ["student", "submitted_at"]

    def _get_pref(self, obj):
        student = getattr(obj, "student", None)
        return getattr(student, "preference_record", None) if student else None

    def _format_sup_name(self, sup):
        if not sup:
            return ""
        prefix = f"{sup.academic_title} " if sup.academic_title else ""
        return f"{prefix}{sup.user.get_full_name() or sup.user.username}".strip()

    def get_preferred_supervisor(self, obj):
        pref = self._get_pref(obj)
        return pref.preference_1_id if (pref and pref.preference_1) else None

    def get_preferred_supervisor_name(self, obj):
        pref = self._get_pref(obj)
        return self._format_sup_name(pref.preference_1) if pref else ""

    def get_preference_1(self, obj):
        pref = self._get_pref(obj)
        return pref.preference_1_id if (pref and pref.preference_1) else None

    def get_preference_1_name(self, obj):
        pref = self._get_pref(obj)
        return self._format_sup_name(pref.preference_1) if pref else ""

    def get_preference_2(self, obj):
        pref = self._get_pref(obj)
        return pref.preference_2_id if (pref and pref.preference_2) else None

    def get_preference_2_name(self, obj):
        pref = self._get_pref(obj)
        return self._format_sup_name(pref.preference_2) if pref else ""

    def get_preference_3(self, obj):
        pref = self._get_pref(obj)
        return pref.preference_3_id if (pref and pref.preference_3) else None

    def get_preference_3_name(self, obj):
        pref = self._get_pref(obj)
        return self._format_sup_name(pref.preference_3) if pref else ""

    def get_secondary_criteria_note(self, obj):
        pref = self._get_pref(obj)
        return pref.sub_criteria if pref else ""

    def validate(self, attrs):
        is_interning = attrs.get("is_interning", False)
        company_name = attrs.get("company_name", "")
        if is_interning and not company_name:
            raise serializers.ValidationError({"company_name": "Vui lòng nhập tên công ty / doanh nghiệp đang thực tập."})
        return attrs


class OutlineReviewSerializer(serializers.ModelSerializer):
    student_name = serializers.SerializerMethodField()
    student_reg_no = serializers.SerializerMethodField()
    topic_title = serializers.CharField(source="project.topic_title_vi", read_only=True, default="")
    group_name = serializers.CharField(source="review_group.name", read_only=True, default="")
    reviewer_name = serializers.SerializerMethodField()
    outline_file_url = serializers.SerializerMethodField()

    class Meta:
        model = OutlineReview
        fields = [
            "id",
            "project",
            "student_name",
            "student_reg_no",
            "topic_title",
            "group_name",
            "review_group",
            "reviewer",
            "reviewer_name",
            "outline_file",
            "outline_file_url",
            "verdict",
            "comments",
            "submitted_at",
            "reviewed_at"
        ]
        read_only_fields = ["submitted_at", "reviewed_at"]

    def get_student_name(self, obj):
        if not obj.project or not obj.project.student or not obj.project.student.user:
            return ""
        u = obj.project.student.user
        if u.last_name and u.first_name:
            return f"{u.last_name} {u.first_name}".strip()
        return u.get_full_name() or u.username

    def get_student_reg_no(self, obj):
        if not obj.project or not obj.project.student:
            return ""
        return obj.project.student.registration_no or ""

    def get_reviewer_name(self, obj):
        if not obj.reviewer:
            return ""
        u = obj.reviewer.user
        prefix = f"{obj.reviewer.academic_title} " if obj.reviewer.academic_title else ""
        name = f"{u.last_name} {u.first_name}".strip() if (u.last_name and u.first_name) else (u.get_full_name() or u.username)
        return f"{prefix}{name}".strip()

    def get_outline_file_url(self, obj):
        if obj.outline_file:
            return obj.outline_file.url
        return ""


class WeeklyProgressReportSerializer(serializers.ModelSerializer):
    supervisor_rating_display = serializers.CharField(source="get_supervisor_rating_display", read_only=True)

    class Meta:
        model = WeeklyProgressReport
        fields = [
            "id",
            "project",
            "week_number",
            "summary_content",
            "planned_tasks",
            "git_commit_link",
            "attached_file",
            "supervisor_feedback",
            "supervisor_rating",
            "supervisor_rating_display",
            "submitted_at",
            "reviewed_at"
        ]
        read_only_fields = ["submitted_at", "reviewed_at"]

    def validate_week_number(self, value):
        if value < 1 or value > 15:
            raise serializers.ValidationError("Tuần báo cáo phải nằm trong khoảng từ 1 đến 15.")
        return value


class SupervisionTaskSerializer(serializers.ModelSerializer):
    priority_display = serializers.CharField(source="get_priority_display", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    review_verdict_display = serializers.CharField(source="get_review_verdict_display", read_only=True)
    assigned_by_name = serializers.CharField(source="assigned_by.user.get_full_name", read_only=True)

    class Meta:
        model = SupervisionTask
        fields = [
            "id",
            "project",
            "meeting_log",
            "title",
            "description",
            "assigned_by",
            "assigned_by_name",
            "due_date",
            "priority",
            "priority_display",
            "status",
            "status_display",
            "is_completed",
            "completed_at",
            "student_notes",
            "deliverable_file",
            "deliverable_url",
            "review_verdict",
            "review_verdict_display",
            "supervisor_review_notes",
            "reviewed_at",
            "is_late",
            "submitted_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["assigned_by", "completed_at", "reviewed_at", "is_late", "submitted_at", "created_at", "updated_at"]


class SupervisionMeetingLogSerializer(serializers.ModelSerializer):
    meeting_type_display = serializers.CharField(source="get_meeting_type_display", read_only=True)
    supervisor_name = serializers.CharField(source="project.supervisor.user.get_full_name", read_only=True)
    tasks = SupervisionTaskSerializer(many=True, read_only=True)

    class Meta:
        model = SupervisionMeetingLog
        fields = [
            "id",
            "project",
            "meeting_date",
            "meeting_time",
            "meeting_type",
            "meeting_type_display",
            "location_or_link",
            "content_discussed",
            "supervisor_notes",
            "next_meeting_plan",
            "supervisor_name",
            "tasks",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["created_at", "updated_at"]


class CouncilLiveScoreSerializer(serializers.ModelSerializer):
    member_name = serializers.CharField(source="member.user.get_full_name", read_only=True)
    member_role = serializers.CharField(source="member.get_role_display", read_only=True)

    class Meta:
        model = CouncilLiveScore
        fields = [
            "id",
            "council",
            "project",
            "member",
            "member_name",
            "member_role",
            "score_presentation",
            "score_content",
            "score_qa",
            "score_demo",
            "total_score",
            "comments",
            "created_at"
        ]
        read_only_fields = ["total_score", "created_at"]

    def validate(self, attrs):
        # Validate that individual component scores do not exceed maximum bounds
        p = float(attrs.get("score_presentation", 0.0))
        c = float(attrs.get("score_content", 0.0))
        q = float(attrs.get("score_qa", 0.0))
        d = float(attrs.get("score_demo", 0.0))

        if p < 0 or p > 3.0:
            raise serializers.ValidationError({"score_presentation": "Điểm thuyết trình tối đa 3.0 điểm."})
        if c < 0 or c > 3.0:
            raise serializers.ValidationError({"score_content": "Điểm nội dung tối đa 3.0 điểm."})
        if q < 0 or q > 2.0:
            raise serializers.ValidationError({"score_qa": "Điểm trả lời câu hỏi tối đa 2.0 điểm."})
        if d < 0 or d > 2.0:
            raise serializers.ValidationError({"score_demo": "Điểm sản phẩm demo tối đa 2.0 điểm."})

        return attrs


class FinalGradeSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = FinalGradeSummary
        fields = [
            "id",
            "supervisor_score",
            "reviewer_score",
            "council_avg_score",
            "final_score_10",
            "final_score_4",
            "final_letter_grade",
            "classification",
            "is_passed",
            "is_finalized",
            "notes",
            "updated_at"
        ]


class GraduationProjectDetailSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.user.get_full_name", read_only=True)
    student_reg_no = serializers.CharField(source="student.registration_no", read_only=True)
    student_phone = serializers.CharField(source="student.phone_number", read_only=True)
    student_email = serializers.CharField(source="student.user.email", read_only=True)
    student_class = serializers.CharField(source="student.department", read_only=True)
    supervisor = SupervisorBriefSerializer(read_only=True)
    reviewer = SupervisorBriefSerializer(read_only=True)
    council_name = serializers.CharField(source="council.council_name", read_only=True, default="")
    defense_room = serializers.SerializerMethodField()
    session_date = serializers.SerializerMethodField()
    session_time = serializers.CharField(source="council.get_session_time_display", read_only=True, default="")
    schedule_slot = serializers.SerializerMethodField()
    council_members = serializers.SerializerMethodField()
    topic_category_name = serializers.CharField(source="topic_category.name", read_only=True, default="")
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    topic_review_status_display = serializers.CharField(source="get_topic_review_status_display", read_only=True)
    initial_eligibility_display = serializers.CharField(source="get_initial_eligibility_display", read_only=True)
    final_academic_eligibility_display = serializers.CharField(source="get_final_academic_eligibility_display", read_only=True)
    reviewer_verdict_display = serializers.CharField(source="get_reviewer_verdict_display", read_only=True)
    defense_status_display = serializers.CharField(source="get_defense_status_display", read_only=True)
    is_currently_defending = serializers.SerializerMethodField()
    task_stats = serializers.SerializerMethodField()
    tasks = SupervisionTaskSerializer(many=True, read_only=True)
    meeting_logs = SupervisionMeetingLogSerializer(many=True, read_only=True)
    outline_review = OutlineReviewSerializer(read_only=True)
    weekly_reports = WeeklyProgressReportSerializer(many=True, read_only=True)
    final_grade = FinalGradeSummarySerializer(source="final_grade_summary", read_only=True)
    signed_outline_file_url = serializers.SerializerMethodField()

    class Meta:
        model = GraduationProject
        fields = [
            "id",
            "student",
            "student_name",
            "student_reg_no",
            "student_phone",
            "student_email",
            "student_class",
            "supervisor",
            "reviewer",
            "council",
            "council_name",
            "defense_room",
            "session_date",
            "session_time",
            "schedule_slot",
            "council_members",
            "batch",
            "topic_category",
            "topic_category_name",
            "topic_title_vi",
            "topic_title_en",
            "status",
            "status_display",
            "topic_review_status",
            "topic_review_status_display",
            "topic_revision_notes",
            "initial_eligibility",
            "initial_eligibility_display",
            "ineligibility_reason",
            "final_academic_eligibility",
            "final_academic_eligibility_display",
            "final_academic_notes",
            "defense_status",
            "defense_status_display",
            "is_currently_defending",
            "is_force_approved",
            "force_approved_at",
            "academic_clearance_status",
            "signed_outline_file",
            "signed_outline_file_url",
            "supervisor_score",
            "supervisor_feedback",
            "debt_credits",
            "is_eligible_for_defense",
            "supervisor_score_is_draft",
            "reviewer_score",
            "reviewer_feedback",
            "reviewer_verdict",
            "reviewer_verdict_display",
            "task_stats",
            "tasks",
            "meeting_logs",
            "outline_review",
            "weekly_reports",
            "final_grade",
            "created_at",
            "updated_at"
        ]

    def get_signed_outline_file_url(self, obj):
        if obj.signed_outline_file:
            return getattr(obj.signed_outline_file, "url", f"/media/outlines/{obj.id}_signed.pdf")
        return ""

    def get_is_currently_defending(self, obj):
        if obj.council and obj.council.current_defending_project_id == obj.id:
            return True
        return obj.defense_status == "DEFENDING" or obj.status == "DEFENDING"

    def get_task_stats(self, obj):
        tasks = obj.tasks.all()
        total = tasks.count()
        completed = tasks.filter(is_completed=True).count()
        in_progress = tasks.filter(status="IN_PROGRESS", is_completed=False).count()
        todo = tasks.filter(status="TODO", is_completed=False).count()
        rate = round((completed / total * 100), 1) if total > 0 else 0
        return {
            "total": total,
            "completed": completed,
            "in_progress": in_progress,
            "todo": todo,
            "completion_rate": rate
        }

    def get_defense_room(self, obj):
        slot = getattr(obj, "schedule_slot", None)
        if slot and slot.room:
            return slot.room
        if obj.council and obj.council.defense_room:
            return obj.council.defense_room
        return ""

    def get_session_date(self, obj):
        slot = getattr(obj, "schedule_slot", None)
        if slot and slot.slot_date:
            return slot.slot_date.isoformat()
        if obj.council and obj.council.session_date:
            return obj.council.session_date.isoformat()
        return None

    def get_schedule_slot(self, obj):
        slot = getattr(obj, "schedule_slot", None)
        if not slot:
            return None
        date_val = slot.slot_date or (obj.council.session_date if obj.council else None)
        room_val = slot.room or (obj.council.defense_room if obj.council else "")
        return {
            "id": slot.id,
            "order_number": slot.order_number,
            "slot_date": date_val.isoformat() if date_val else None,
            "start_time": slot.start_time.strftime("%H:%M") if slot.start_time else None,
            "end_time": slot.end_time.strftime("%H:%M") if slot.end_time else None,
            "room": room_val,
            "session_time": obj.council.get_session_time_display() if obj.council else "",
        }

    def get_council_members(self, obj):
        if not obj.council:
            return []
        role_priority = {"CHAIR": 1, "SECRETARY": 2, "MEMBER": 3, "EXTERNAL_MEMBER": 4}
        members = obj.council.members.all().select_related("user", "supervisor")
        sorted_members = sorted(members, key=lambda m: role_priority.get(m.role, 5))
        res = []
        for m in sorted_members:
            title = getattr(m.supervisor, "academic_title", "") if m.supervisor else ""
            full_name = m.user.get_full_name() or m.user.username
            display_name = f"{title} {full_name}".strip() if title else full_name
            dept = getattr(m.supervisor, "department", "") if m.supervisor else (m.external_institution or "")
            res.append({
                "id": m.id,
                "role": m.role,
                "role_display": m.get_role_display(),
                "name": full_name,
                "display_name": display_name,
                "academic_title": title,
                "email": m.user.email,
                "department": dept,
                "external_institution": m.external_institution or "",
            })
        return res


class ProposedAllocationSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.user.get_full_name", read_only=True)
    student_reg_no = serializers.CharField(source="student.registration_no", read_only=True)
    student_cpa = serializers.FloatField(source="student.cpa", read_only=True)
    student_program = serializers.CharField(source="student.get_degree_program_display", read_only=True)
    supervisor_name = serializers.SerializerMethodField()
    supervisor_title = serializers.CharField(source="supervisor.academic_title", read_only=True)

    class Meta:
        model = ProposedAllocation
        fields = [
            "id",
            "batch",
            "student",
            "student_name",
            "student_reg_no",
            "student_cpa",
            "student_program",
            "supervisor",
            "supervisor_name",
            "supervisor_title",
            "matched_preference",
            "match_score",
            "is_overridden",
            "override_reason",
            "created_at",
        ]

    def get_supervisor_name(self, obj):
        prefix = f"{obj.supervisor.academic_title} " if obj.supervisor.academic_title else ""
        return f"{prefix}{obj.supervisor.user.get_full_name() or obj.supervisor.user.username}".strip()


class ThesisDeferralRequestSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.user.get_full_name", read_only=True)
    student_reg_no = serializers.CharField(source="student.registration_no", read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    evidence_file_url = serializers.SerializerMethodField()
    reviewed_by_name = serializers.CharField(source="reviewed_by.get_full_name", read_only=True)

    class Meta:
        model = ThesisDeferralRequest
        fields = [
            "id",
            "project",
            "student",
            "student_name",
            "student_reg_no",
            "reason",
            "evidence_file",
            "evidence_file_url",
            "status",
            "status_display",
            "admin_notes",
            "submitted_at",
            "reviewed_at",
            "reviewed_by",
            "reviewed_by_name",
        ]
        read_only_fields = ["submitted_at", "reviewed_at", "reviewed_by"]

    def get_evidence_file_url(self, obj):
        if obj.evidence_file:
            return obj.evidence_file.url
        return ""


class AcademicBatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicBatch
        fields = [
            "id",
            "batch_code",
            "batch_name",
            "start_date",
            "end_date",
            "is_active",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]

