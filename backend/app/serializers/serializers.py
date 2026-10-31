# students/serializers.py
from rest_framework import serializers
from django.db.models import Q
from django.utils import timezone
from app.models import (
    Student,
    Supervisor,
    CommitteeMember,
    CustomUser,
    Group,
    GroupMember,
    GroupJoinRequest,
    GroupCreationComment,
    AcademicBatch,
    ProjectCategories,
    ProjectTopicArea,
    Project,
    SupervisorStudentComments,
    SupervisorOfStudentGroup,
    Document,
    DocumentComment,
    ScopeDocumentEvaluationCriteria,
    CommitteeMemberPanel,
    CommitteeMemberTemplates,
    DocumentRequirement,
    SRSEvaluationSupervisor,
    SRSEvaluationCommitteeMember,
    SDDEvaluationSupervisor,
    SDDEvaluationCommitteeMember,
    Evaluation3Supervisor,
    Evaluation3CommitteeMember,
    Evaluation4Supervisor,
    Evaluation4CommitteeMember,
    ChatRoom,
    Notification,
    NotificationPreference,
    AuditLog,
    ExternalExaminer,
    ExternalGroup,
    ExternalGroupAssignment,
    ExternalEvaluation,
    EvaluationSchedule,
    SystemBugReport,
)
from app.validators import (
    validate_chat_message,
    validate_comment,
    validate_project_name,
    validate_project_description,
    validate_functionalities,
    validate_evaluation_comment,
    validate_title,
    validate_no_html,
    validate_uploaded_file,
    MAX_CHAT_MESSAGE_LENGTH,
    MAX_COMMENT_LENGTH,
    MAX_PROJECT_DESCRIPTION_LENGTH,
    MAX_FUNCTIONALITIES_LENGTH,
    MAX_EVALUATION_COMMENT_LENGTH,
    MAX_TITLE_LENGTH,
)


class CustomUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomUser
        fields = ["id", "username", "email", "user_type", "first_name", "last_name"]


class StudentProfileSerializer(serializers.ModelSerializer):
    user = CustomUserSerializer(read_only=True)
    group_id = serializers.SerializerMethodField(read_only=True)
    groupmate_id = serializers.SerializerMethodField(read_only=True)
    has_group = serializers.SerializerMethodField(read_only=True)
    my_group_name = serializers.SerializerMethodField(read_only=True)
    external_evaluation = serializers.SerializerMethodField(read_only=True)
    academic_batch = serializers.SerializerMethodField(read_only=True)
    graduation_project = serializers.SerializerMethodField(read_only=True)
    timeline_step = serializers.SerializerMethodField(read_only=True)

    def get_group_id(self, obj):
        proj = getattr(obj, "graduation_project", None)
        return proj.id if proj else None

    def get_groupmate_id(self, obj):
        proj = getattr(obj, "graduation_project", None)
        return proj.id if proj else None

    def get_has_group(self, obj):
        return bool(getattr(obj, "graduation_project", None))

    def get_my_group_name(self, obj):
        proj = getattr(obj, "graduation_project", None)
        if proj:
            return proj.topic_title_vi or f"Đồ án tốt nghiệp: {obj.registration_no}"
        return None

    def get_external_evaluation(self, obj):
        return None

    def get_academic_batch(self, obj):
        batch = getattr(obj, "academic_batch", None)
        if not batch:
            from ..models import AcademicBatch
            batch = AcademicBatch.objects.filter(is_active=True).first()
        if batch:
            return {
                "id": batch.id,
                "batch_code": batch.batch_code,
                "batch_name": batch.batch_name,
                "current_stage": getattr(batch, "current_stage", "PHASE_1_SETUP"),
                "is_active": batch.is_active,
            }
        return None

    def get_graduation_project(self, obj):
        proj = getattr(obj, "graduation_project", None)
        if proj:
            sup = getattr(proj, "supervisor", None)
            sup_name = (sup.user.get_full_name() or sup.user.username) if (sup and sup.user) else None
            sup_email = sup.user.email if (sup and sup.user) else None

            # Stage-relevant nested data so the student sidebar can determine the
            # exact 1 -> 6 stage without falling back to an outdated value.
            outline_review = getattr(proj, "outline_review", None)
            final_grade = getattr(proj, "final_grade_summary", None)
            try:
                tasks = [
                    {"id": t.id, "status": t.status, "is_completed": t.is_completed}
                    for t in proj.tasks.all()
                ]
            except Exception:
                tasks = []
            try:
                weekly_reports = [
                    {
                        "week_number": r.week_number,
                        "supervisor_rating": r.supervisor_rating,
                        "supervisor_feedback": r.supervisor_feedback,
                    }
                    for r in proj.weekly_reports.all()
                ]
            except Exception:
                weekly_reports = []

            slot = getattr(proj, "schedule_slot", None)
            schedule_slot_data = None
            if slot:
                date_val = slot.slot_date or (proj.council.session_date if proj.council else None)
                schedule_slot_data = {
                    "id": slot.id,
                    "order_number": slot.order_number,
                    "slot_date": date_val.isoformat() if date_val else None,
                    "start_time": slot.start_time.strftime("%H:%M") if slot.start_time else None,
                    "end_time": slot.end_time.strftime("%H:%M") if slot.end_time else None,
                    "room": slot.room or (proj.council.defense_room if proj.council else ""),
                    "session_time": proj.council.get_session_time_display() if proj.council else "",
                }

            council_members_data = []
            if proj.council:
                role_priority = {"CHAIR": 1, "SECRETARY": 2, "MEMBER": 3, "EXTERNAL_MEMBER": 4}
                for m in sorted(proj.council.members.all().select_related("user", "supervisor"), key=lambda x: role_priority.get(x.role, 5)):
                    title = getattr(m.supervisor, "academic_title", "") if m.supervisor else ""
                    fn = m.user.get_full_name() or m.user.username
                    council_members_data.append({
                        "id": m.id,
                        "role": m.role,
                        "role_display": m.get_role_display(),
                        "name": fn,
                        "display_name": f"{title} {fn}".strip() if title else fn,
                        "academic_title": title,
                        "email": m.user.email,
                        "department": getattr(m.supervisor, "department", "") if m.supervisor else (m.external_institution or ""),
                    })

            return {
                "id": proj.id,
                "topic_title_vi": proj.topic_title_vi,
                "topic_title_en": proj.topic_title_en,
                "status": proj.status,
                "status_display": proj.get_status_display() if hasattr(proj, "get_status_display") else proj.status,
                "topic_review_status": proj.topic_review_status,
                "topic_review_status_display": proj.get_topic_review_status_display() if hasattr(proj, "get_topic_review_status_display") else proj.topic_review_status,
                "topic_revision_notes": proj.topic_revision_notes,
                "initial_eligibility": proj.initial_eligibility,
                "initial_eligibility_display": proj.get_initial_eligibility_display() if hasattr(proj, "get_initial_eligibility_display") else proj.initial_eligibility,
                "ineligibility_reason": proj.ineligibility_reason,
                "final_academic_eligibility": proj.final_academic_eligibility,
                "supervisor_name": sup_name,
                "supervisor_email": sup_email,
                "supervisor_score": proj.supervisor_score,
                "supervisor_feedback": proj.supervisor_feedback,
                "supervisor_defense_confirmed": proj.supervisor_defense_confirmed,
                "reviewer_score": proj.reviewer_score,
                "reviewer_name": (proj.reviewer.user.get_full_name() or proj.reviewer.user.username) if (proj.reviewer and proj.reviewer.user) else None,
                "council_name": proj.council.council_name if proj.council else "",
                "defense_room": slot.room if (slot and slot.room) else (proj.council.defense_room if proj.council else ""),
                "session_date": slot.slot_date.isoformat() if (slot and slot.slot_date) else (proj.council.session_date.isoformat() if (proj.council and proj.council.session_date) else None),
                "session_time": proj.council.get_session_time_display() if proj.council else "",
                "schedule_slot": schedule_slot_data,
                "council_members": council_members_data,
                "is_eligible_for_defense": getattr(proj, "is_eligible_for_defense", False),
                "outline_review": (
                    {
                        "verdict": outline_review.verdict,
                        "comments": outline_review.comments,
                    }
                    if outline_review
                    else None
                ),
                "tasks": tasks,
                "weekly_reports": weekly_reports,
                "final_grade": (
                    {
                        "is_finalized": final_grade.is_finalized,
                        "final_score_10": final_grade.final_score_10,
                    }
                    if final_grade
                    else None
                ),
            }
        return None

    def get_timeline_step(self, obj):
        batch = getattr(obj, "academic_batch", None)
        if not batch:
            from app.models import AcademicBatch
            batch = AcademicBatch.objects.filter(is_active=True).first()

        batch_step = 1
        if batch:
            stage = getattr(batch, "current_stage", "")
            if stage in ["PHASE_6_DEFENSE", "COMPLETED"]:
                batch_step = 5
            elif stage in ["PHASE_4_ELIGIBILITY", "PHASE_5_IN_PROGRESS"]:
                batch_step = 4
            elif stage == "PHASE_3_TOPIC":
                batch_step = 3
            elif stage == "PHASE_2_LOCKED":
                batch_step = 2
            elif stage in ["PHASE_1_SETUP", "PHASE_2_ALLOCATING"]:
                batch_step = 1

        proj = getattr(obj, "graduation_project", None)
        project_step = 1
        if proj:
            status = getattr(proj, "status", "")
            review_status = getattr(proj, "topic_review_status", "")
            if status in ["DEFENSE_READY", "DEFENSE_PASSED", "PASSED"]:
                project_step = 5
            elif status in ["SUBMITTED", "FINAL_SUBMISSION"]:
                project_step = 4
            elif status in ["IN_PROGRESS", "OUTLINE_APPROVED", "MIDTERM_EVALUATED"] or review_status == "APPROVED":
                project_step = 3
            elif status in ["ALLOCATED", "TOPIC_CONFIRMED", "OUTLINE_PENDING"] or review_status in ["GV_CONFIRMED", "REVISION_REQUIRED"]:
                project_step = 2
            else:
                project_step = 1

        return max(batch_step, project_step)

    class Meta:
        model = Student
        fields = [
            "id",
            "user",
            "registration_no",
            "department",
            "semester",
            "batch_no",
            "group_id",
            "groupmate_id",
            "has_group",
            "my_group_name",
            "external_evaluation",
            "academic_batch",
            "graduation_project",
            "timeline_step",
        ]


class SupervisorProfileSerializer(serializers.ModelSerializer):
    user = CustomUserSerializer(read_only=True)
    timeline_step = serializers.SerializerMethodField(read_only=True)

    def get_timeline_step(self, obj):
        from app.models import AcademicBatch
        batch = AcademicBatch.objects.filter(is_active=True).first()
        if not batch:
            return 3
        stage = getattr(batch, "current_stage", "")
        if stage in ["PHASE_6_DEFENSE", "COMPLETED"]:
            return 5
        elif stage in ["PHASE_4_ELIGIBILITY", "PHASE_5_IN_PROGRESS"]:
            return 4
        elif stage == "PHASE_3_TOPIC":
            return 3
        elif stage == "PHASE_2_LOCKED":
            return 2
        return 1

    class Meta:
        model = Supervisor
        fields = [
            "id",
            "user",
            "supervisor_id",
            "academic_title",
            "department_name",
            "research_interest",
            "academic_background",
            "timeline_step",
        ]
        read_only_fields = ["id", "user", "supervisor_id", "academic_title", "department_name", "timeline_step"]


class CommitteeMemberProfileSerializer(serializers.ModelSerializer):
    user = CustomUserSerializer(read_only=True)
    panel_info = serializers.SerializerMethodField(read_only=True)

    def get_panel_info(self, obj):
        if obj.panel:
            # Get other committee members in the same panel
            members = CommitteeMember.objects.filter(panel=obj.panel).exclude(id=obj.id)
            members_data = []
            for member in members:
                members_data.append({
                    "id": member.id,
                    "user": {
                        "id": member.user.id,
                        "username": member.user.username,
                        "first_name": member.user.first_name,
                        "last_name": member.user.last_name,
                        "email": member.user.email,
                    },
                    "committee_id": member.committee_id,
                })
            return {
                "id": obj.panel.id,
                "name": obj.panel.name,
                "members": members_data,  # Other members (excluding self)
            }
        return None

    class Meta:
        model = CommitteeMember
        fields = ["id", "user", "committee_id", "panel", "panel_info"]


class PanelSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommitteeMemberPanel
        fields = ["id", "name", "committee_member", "projects"]
        read_only_fields = ["id"]


class PanelMemberSerializer(serializers.ModelSerializer):
    """Serializer for committee members in panel display (minimal info)."""
    user = CustomUserSerializer(read_only=True)

    class Meta:
        model = CommitteeMember
        fields = ["id", "user", "committee_id"]


class PanelDetailSerializer(serializers.ModelSerializer):
    """Serializer for panel with its committee members."""
    members = serializers.SerializerMethodField(read_only=True)

    def get_members(self, obj):
        committee_members = CommitteeMember.objects.filter(panel=obj)
        return PanelMemberSerializer(committee_members, many=True).data

    class Meta:
        model = CommitteeMemberPanel
        fields = ["id", "name", "members"]
        read_only_fields = ["id"]


class ProjectCategoriesSerializer(serializers.ModelSerializer):
    supervisor = SupervisorProfileSerializer(many=True, read_only=True)

    class Meta:
        model = ProjectCategories
        fields = ["id", "category_name", "supervisor"]


class ProjectTopicAreaOptionSerializer(serializers.ModelSerializer):
    """Pure UTC schema (25 tables) replacement for the legacy ProjectCategories API.

    The frontend still expects the legacy shape (`category_name`), so we expose the
    ProjectTopicArea name under both keys.
    """

    category_name = serializers.CharField(source="name", read_only=True)

    class Meta:
        model = ProjectTopicArea
        fields = ["id", "code", "name", "category_name", "description", "is_active"]


class GroupStatusSerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = ["status"]


class GroupCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Group
        fields = ["project_category"]


class GroupRequestSerializer(serializers.ModelSerializer):
    student_1 = serializers.PrimaryKeyRelatedField(
        queryset=Student.objects.all(), write_only=True
    )
    student_2 = serializers.PrimaryKeyRelatedField(
        queryset=Student.objects.all(), write_only=True
    )
    project_category = serializers.PrimaryKeyRelatedField(
        queryset=ProjectCategories.objects.all(), write_only=True
    )
    student_1_details = StudentProfileSerializer(read_only=True, source="student_1")
    student_2_details = StudentProfileSerializer(read_only=True, source="student_2")
    project_category_details = ProjectCategoriesSerializer(
        read_only=True, source="project_category"
    )
    comment_count = serializers.SerializerMethodField(read_only=True)

    def get_comment_count(self, obj):
        return GroupCreationComment.objects.filter(group=obj.id).count()

    def validate(self, attrs):
        if attrs.get("student_1") == attrs.get("student_2"):
            raise serializers.ValidationError("You cannot send a request to yourself.")
        return super().validate(attrs)

    def create(self, validated_data):
        project_category = validated_data.pop("project_category")
        student_1 = validated_data.get("student_1")
        student_2 = validated_data.get("student_2")
        
        # Check if a group already exists between these two students
        existing_group = Group.objects.filter(
            student_1=student_1,
            student_2=student_2
        ).first()
        
        if existing_group:
            # If group exists, update it (reset status to pending if it was canceled/rejected)
            if existing_group.status in ["canceled", "rejected"]:
                existing_group.status = "pending"
            existing_group.project_category = project_category
            existing_group.save()
            return existing_group
        else:
            # Create new group
            obj = Group(**validated_data)
            obj.project_category = project_category
            obj.save()
            return obj

    class Meta:
        model = Group
        fields = [
            "id",
            "student_1",
            "student_2",
            "status",
            "project_category",
            "comment_count",
            "student_1_details",
            "student_2_details",
            "project_category_details",
        ]
        read_only_fields = ["comment_count", "status"]


class CommentSerializer(serializers.ModelSerializer):
    student = StudentProfileSerializer(read_only=True)
    comment = serializers.CharField(
        max_length=MAX_COMMENT_LENGTH,
        validators=[validate_comment],
        help_text=f"Comment text (max {MAX_COMMENT_LENGTH} characters)"
    )

    class Meta:
        model = GroupCreationComment
        fields = ["id", "comment", "group", "student", "created_at"]
        read_only_fields = [
            "id",
            "created_at",
            "group",
            "student",
        ]  # Add 'group' and 'student'


class ProjectSerializer(serializers.ModelSerializer):
    groups_data = serializers.SerializerMethodField(read_only=True)
    panel_info = serializers.SerializerMethodField(read_only=True)
    is_offered = serializers.SerializerMethodField(read_only=True)
    has_registered_groups = serializers.SerializerMethodField(read_only=True)

    # Add validation for text fields
    project_name = serializers.CharField(
        max_length=200,
        validators=[validate_project_name],
        help_text="Project name (max 200 characters)"
    )
    project_description = serializers.CharField(
        max_length=MAX_PROJECT_DESCRIPTION_LENGTH,
        validators=[validate_project_description],
        help_text=f"Project description (max {MAX_PROJECT_DESCRIPTION_LENGTH} characters)"
    )
    language = serializers.CharField(
        max_length=200,
        validators=[validate_no_html],
        help_text="Programming language(s) (max 200 characters)"
    )
    functionalities = serializers.CharField(
        max_length=MAX_FUNCTIONALITIES_LENGTH,
        validators=[validate_functionalities],
        help_text=f"Project functionalities (max {MAX_FUNCTIONALITIES_LENGTH} characters)"
    )

    def get_groups_data(self, obj):
        return obj.groups.filter(status="accepted").values_list(flat=True)

    def get_panel_info(self, obj):
        if obj.panel:
            return PanelDetailSerializer(obj.panel).data
        return None

    def get_is_offered(self, obj):
        return obj.user_id is None

    def get_has_registered_groups(self, obj):
        return obj.groups.filter(status__in=["pending", "accepted"]).exists()

    class Meta:
        model = Project
        fields = [
            "id",
            "project_category",
            "project_name",
            "project_description",
            "language",
            "functionalities",
            "groups_data",
            "panel_info",
            "is_offered",
            "has_registered_groups",
        ]

        read_only_fields = ["id", "groups_data", "panel_info", "is_offered", "has_registered_groups"]

    def create(self, validated_data):
        request = self.context.get("request")
        validated_data.update({"user": request.user})
        response = super().create(validated_data=validated_data)
        Project.objects.filter(user=request.user).exclude(pk=response.pk).delete()
        return response


class ScopeDocumentEvaluationCriteriaSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScopeDocumentEvaluationCriteria
        fields = "__all__"
        read_only_fields = ["id"]


class SupervisorOfStudentGroupSerializer(serializers.ModelSerializer):
    supervisor = SupervisorProfileSerializer(read_only=True)
    project = ProjectSerializer(read_only=True)
    group = GroupRequestSerializer(read_only=True)
    external_status = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = SupervisorOfStudentGroup
        fields = [
            "id",
            "group",
            "supervisor",
            "project",
            "status",
            "created_at",
            "created_by",
            "Scope_document_evaluation_form",
            "srs_evaluation_supervisor",
            "srs_evaluation_committee_member",
            "sdd_evaluation_supervisor",
            "sdd_evaluation_committee_member",
            "evaluation3_supervisor",
            "evaluation3_committee_member",
            "evaluation4_supervisor",
            "evaluation4_committee_member",
            "is_ready_for_external",
            "external_evaluation_status",
            "external_status",
        ]
    
    def get_external_status(self, obj):
        """Get detailed external assignment status."""
        try:
            assignment = obj.external_assignment
            result = {
                'is_assigned': True,
                'external_group_id': assignment.external_group.id,
                'external_group_name': assignment.external_group.name,
                'external_examiner': assignment.external_group.external_examiner.user.get_full_name(),
                'slot_number': assignment.slot_number,
                'slot_time': assignment.slot_time,
                'assignment_status': assignment.status,
            }
            
            # Check for evaluation
            if hasattr(assignment, 'evaluation') and assignment.evaluation:
                result['evaluation'] = {
                    'grade': assignment.evaluation.grade,
                    'total_marks': assignment.evaluation.total_marks,
                    'is_pass': assignment.evaluation.is_pass,
                    'evaluated_at': assignment.evaluation.evaluated_at
                }
            else:
                result['evaluation'] = None
            
            return result
        except Exception:
            return {
                'is_assigned': False,
                'external_group_id': None,
                'external_group_name': None,
                'external_examiner': None,
                'evaluation': None
            }


class SupervisorStudentModelCommentsSerializer(serializers.ModelSerializer):
    student = StudentProfileSerializer(read_only=True)
    supervisor = SupervisorProfileSerializer(read_only=True)
    comment = serializers.CharField(
        max_length=MAX_COMMENT_LENGTH,
        validators=[validate_comment],
        help_text=f"Comment text (max {MAX_COMMENT_LENGTH} characters)"
    )

    class Meta:
        model = SupervisorStudentComments
        fields = [
            "id",
            "group",
            "student",
            "supervisor",
            "comment",
            "commented_by",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class DocumentSerializer(serializers.ModelSerializer):
    # File validation constants
    MAX_FILE_SIZE_MB = 25
    MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024  # 25MB in bytes
    ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'ppt', 'pptx']
    ALLOWED_CONTENT_TYPES = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ]

    uploaded_by = StudentProfileSerializer(read_only=True)
    document_type = serializers.CharField(required=False)
    project_name = serializers.SerializerMethodField(read_only=True)
    comments_count = serializers.IntegerField(source="comments.count", read_only=True)
    title = serializers.CharField(
        max_length=MAX_TITLE_LENGTH,
        validators=[validate_title],
        help_text=f"Document title (max {MAX_TITLE_LENGTH} characters)"
    )

    def get_project_name(self, obj):
        return obj.group.project.project_name

    def validate_uploaded_file(self, value):
        """Validate uploaded file size, type, and binary magic bytes."""
        if value is None:
            return value

        # Validate with comprehensive binary magic byte and executable check
        allowed_exts = [f".{ext.lower()}" for ext in self.ALLOWED_EXTENSIONS]
        return validate_uploaded_file(
            value,
            allowed_extensions=allowed_exts,
            max_size_bytes=self.MAX_FILE_SIZE_BYTES
        )

    class Meta:
        model = Document
        fields = [
            "id",
            "title",
            "document_type",
            "uploaded_file",
            "uploaded_at",
            "status",
            "group",
            "project_name",
            "uploaded_by",
            "submitted_to_committee",
            "submitted_to_committee_at",
            "is_late",
            "late_duration",
            "comments_count",
        ]
        read_only_fields = [
            "uploaded_at",
            "status",
            "group",
            "uploaded_by",
            "project_name",
            "submitted_to_committee",
            "submitted_to_committee_at",
            "is_late",
            "late_duration",
            "comments_count",
        ]


class DocumentCommentSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField(read_only=True)
    author_type = serializers.CharField(source="author.user_type", read_only=True)

    def get_author_name(self, obj):
        return obj.author.get_full_name() or obj.author.username

    class Meta:
        model = DocumentComment
        fields = [
            "id",
            "document",
            "author",
            "author_name",
            "author_type",
            "section",
            "comment",
            "created_at",
        ]
        read_only_fields = ["id", "author", "author_name", "author_type", "created_at"]


class DocumentStatusUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Document
        fields = ["status"]


class SupervisorDocumentSerializer(serializers.ModelSerializer):
    """Serializer for documents as viewed by supervisors, includes group and student info."""
    uploaded_by = StudentProfileSerializer(read_only=True)
    group_info = serializers.SerializerMethodField()
    comments_count = serializers.IntegerField(source="comments.count", read_only=True)

    class Meta:
        model = Document
        fields = [
            "id",
            "title",
            "document_type",
            "uploaded_file",
            "uploaded_at",
            "status",
            "group",
            "uploaded_by",
            "group_info",
            "submitted_to_committee",
            "submitted_to_committee_at",
            "is_late",
            "late_duration",
            "comments_count",
        ]

    def get_group_info(self, obj):
        """Get group details including students and project name."""
        if obj.group:
            return {
                "id": obj.group.id,
                "project_name": obj.group.project.project_name if obj.group.project else None,
                "student_1": {
                    "id": obj.group.group.student_1.id if obj.group.group.student_1 else None,
                    "username": obj.group.group.student_1.user.username if obj.group.group.student_1 else None,
                    "registration_no": obj.group.group.student_1.registration_no if obj.group.group.student_1 else None,
                } if obj.group.group.student_1 else None,
                "student_2": {
                    "id": obj.group.group.student_2.id if obj.group.group.student_2 else None,
                    "username": obj.group.group.student_2.user.username if obj.group.group.student_2 else None,
                    "registration_no": obj.group.group.student_2.registration_no if obj.group.group.student_2 else None,
                } if obj.group.group.student_2 else None,
            }
        return None


class CommitteeMemberTemplatesSerializer(serializers.ModelSerializer):
    # File validation constants
    MAX_FILE_SIZE_MB = 25
    MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024  # 25MB in bytes
    ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx', 'ppt', 'pptx']
    ALLOWED_CONTENT_TYPES = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ]

    uploaded_by = CommitteeMemberProfileSerializer(read_only=True)
    template_type = serializers.CharField(required=False)
    title = serializers.CharField(
        max_length=MAX_TITLE_LENGTH,
        validators=[validate_title],
        help_text=f"Template title (max {MAX_TITLE_LENGTH} characters)"
    )

    def validate_uploaded_file(self, value):
        """Validate uploaded file size, type, and binary magic bytes."""
        if value is None:
            return value

        allowed_exts = [f".{ext.lower()}" for ext in self.ALLOWED_EXTENSIONS]
        return validate_uploaded_file(
            value,
            allowed_extensions=allowed_exts,
            max_size_bytes=self.MAX_FILE_SIZE_BYTES
        )

    class Meta:
        model = CommitteeMemberTemplates
        fields = [
            "id",
            "title",
            "uploaded_by",
            "uploaded_file",
            "uploaded_at",
            "semester",
            "template_type",
        ]


class DocumentRequirementSerializer(serializers.ModelSerializer):
    document_type_display = serializers.SerializerMethodField(read_only=True)
    deadline = serializers.DateTimeField(required=True)
    semester = serializers.CharField(required=False, allow_blank=True, allow_null=True, max_length=20)

    def get_document_type_display(self, obj):
        return obj.get_document_type_display()

    def validate_deadline(self, value):
        if value is None:
            return value
        try:
            if timezone.is_naive(value):
                value = timezone.make_aware(value)
        except (ValueError, TypeError):
            pass
        return value

    def validate_semester(self, value):
        if value is None:
            return None
        if not isinstance(value, str):
            return None
        value = (value or "").strip()
        return value or None

    class Meta:
        model = DocumentRequirement
        fields = [
            "id",
            "document_type",
            "document_type_display",
            "title",
            "deadline",
            "allow_late_submission",
            "semester",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "created_by", "document_type_display"]


class SRSEvaluationSupervisorSerializer(serializers.ModelSerializer):
    comment = serializers.CharField(
        max_length=MAX_EVALUATION_COMMENT_LENGTH,
        validators=[validate_evaluation_comment],
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text=f"Optional comment (max {MAX_EVALUATION_COMMENT_LENGTH} characters)"
    )

    class Meta:
        model = SRSEvaluationSupervisor
        fields = [
            "id",
            "regularity",
            "srs_are_frs_mapped_to_the_problem",
            "srs_are_nfr_mapped_to_the_problem",
            "is_srs_storyboarding",
            "according_to_requirement",
            "is_srs_template_followed",
            "is_write_up_correct",
            "student_participation",
            "comment",
            "is_draft",
            "total_marks",
        ]
        read_only_fields = ["id"]


class SRSEvaluationCommitteeMemberSerializer(serializers.ModelSerializer):
    comment = serializers.CharField(
        max_length=MAX_EVALUATION_COMMENT_LENGTH,
        validators=[validate_evaluation_comment],
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text=f"Optional comment (max {MAX_EVALUATION_COMMENT_LENGTH} characters)"
    )

    class Meta:
        model = SRSEvaluationCommitteeMember
        fields = [
            "id",
            "analysis_of_existing_systems",
            "problem_defined",
            "proposed_solution",
            "tools_technologies",
            "frs_mapped",
            "nfrs_mapped",
            "requirements_analysis",
            "mocks_defined",
            "srs_template_followed",
            "technical_writeup_correct",
            "domain_knowledge",
            "qa_ability",
            "presentation_attire",
            "comment",
            "total_marks",
        ]
        read_only_fields = ["id"]


class SDDEvaluationSupervisorSerializer(serializers.ModelSerializer):
    comment = serializers.CharField(
        max_length=MAX_EVALUATION_COMMENT_LENGTH,
        validators=[validate_evaluation_comment],
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text=f"Optional comment (max {MAX_EVALUATION_COMMENT_LENGTH} characters)"
    )

    class Meta:
        model = SDDEvaluationSupervisor
        fields = [
            "id",
            "data_representation_diagram",
            "process_flow",
            "design_models",
            "algorithms_defined",
            "module_completion_status",
            "is_sdd_template_followed",
            "is_technical_writeup_correct",
            "regularity",
            "seminar_participation",
            "comment",
            "is_draft",
            "total_marks",
        ]
        read_only_fields = ["id"]


class SDDEvaluationCommitteeMemberSerializer(serializers.ModelSerializer):
    comment = serializers.CharField(
        max_length=MAX_EVALUATION_COMMENT_LENGTH,
        validators=[validate_evaluation_comment],
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text=f"Optional comment (max {MAX_EVALUATION_COMMENT_LENGTH} characters)"
    )

    class Meta:
        model = SDDEvaluationCommitteeMember
        fields = [
            "id",
            "data_representation_diagram",
            "process_flow",
            "sdd_design_models",
            "algorithm_defined",
            "modules_completion_status",
            "sdd_template_followed",
            "technical_writeup_correct",
            "project_domain_knowledge",
            "qa_ability",
            "proper_attire",
            "comment",
            "total_marks",
        ]
        read_only_fields = ["id"]


class Evaluation3SupervisorSerializer(serializers.ModelSerializer):
    comment = serializers.CharField(
        max_length=MAX_EVALUATION_COMMENT_LENGTH,
        validators=[validate_evaluation_comment],
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text=f"Optional comment (max {MAX_EVALUATION_COMMENT_LENGTH} characters)"
    )

    class Meta:
        model = Evaluation3Supervisor
        fields = [
            "id",
            "module_completion",
            "software_testing",
            "regularity",
            "project_domain_knowledge",
            "is_template_followed",
            "is_writeup_correct",
            "comment",
            "is_draft",
            "total_marks",
        ]
        read_only_fields = ["id"]


class Evaluation3CommitteeMemberSerializer(serializers.ModelSerializer):
    comment = serializers.CharField(
        max_length=MAX_EVALUATION_COMMENT_LENGTH,
        validators=[validate_evaluation_comment],
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text=f"Optional comment (max {MAX_EVALUATION_COMMENT_LENGTH} characters)"
    )

    class Meta:
        model = Evaluation3CommitteeMember
        fields = [
            "id",
            "module_completion",
            "software_testing",
            "qa_ability",
            "proper_attire",
            "is_template_followed",
            "is_writeup_correct",
            "comment",
            "total_marks",
        ]
        read_only_fields = ["id"]


class Evaluation4SupervisorSerializer(serializers.ModelSerializer):
    comment = serializers.CharField(
        max_length=MAX_EVALUATION_COMMENT_LENGTH,
        validators=[validate_evaluation_comment],
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text=f"Optional comment (max {MAX_EVALUATION_COMMENT_LENGTH} characters)"
    )

    class Meta:
        model = Evaluation4Supervisor
        fields = [
            "id",
            "module_completion",
            "student_participation_seminar",
            "is_template_followed",
            "is_writeup_correct",
            "comment",
            "is_draft",
            "total_marks",
        ]
        read_only_fields = ["id"]


class Evaluation4CommitteeMemberSerializer(serializers.ModelSerializer):
    comment = serializers.CharField(
        max_length=MAX_EVALUATION_COMMENT_LENGTH,
        validators=[validate_evaluation_comment],
        required=False,
        allow_blank=True,
        allow_null=True,
        help_text=f"Optional comment (max {MAX_EVALUATION_COMMENT_LENGTH} characters)"
    )

    class Meta:
        model = Evaluation4CommitteeMember
        fields = [
            "id",
            "module_completion",
            "software_testing",
            "qa_ability",
            "proper_attire",
            "is_template_followed",
            "is_writeup_correct",
            "comment",
            "total_marks",
        ]
        read_only_fields = ["id"]


class ChatRoomSerializer(serializers.ModelSerializer):
    MAX_ATTACHMENT_SIZE_MB = 25
    MAX_ATTACHMENT_SIZE_BYTES = MAX_ATTACHMENT_SIZE_MB * 1024 * 1024
    ALLOWED_ATTACHMENT_EXTENSIONS = [
        "jpg", "jpeg", "png", "gif", "webp", "svg",
        "pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx", "txt", "zip", "rar"
    ]

    student = StudentProfileSerializer(read_only=True)
    supervisor = SupervisorProfileSerializer(read_only=True)
    message = serializers.CharField(
        max_length=MAX_CHAT_MESSAGE_LENGTH,
        required=False,
        allow_blank=True,
        default="",
        help_text=f"Chat message (max {MAX_CHAT_MESSAGE_LENGTH} characters)"
    )
    attachment = serializers.FileField(required=False, allow_null=True)
    attachment_name = serializers.CharField(required=False, allow_null=True, allow_blank=True, max_length=255)
    attachment_type = serializers.CharField(required=False, allow_null=True, allow_blank=True, max_length=100)
    attachment_size = serializers.IntegerField(required=False, allow_null=True)

    def validate_message(self, value):
        if value:
            from app.validators import validate_no_html
            value = validate_no_html(value)
            if len(value) > MAX_CHAT_MESSAGE_LENGTH:
                raise serializers.ValidationError(
                    f"Message is too long. Maximum {MAX_CHAT_MESSAGE_LENGTH} characters allowed."
                )
            return value.strip()
        return ""

    def validate_attachment(self, value):
        if not value:
            return None
        if value.size > self.MAX_ATTACHMENT_SIZE_BYTES:
            raise serializers.ValidationError(
                f"Attachment size exceeds maximum allowed size of {self.MAX_ATTACHMENT_SIZE_MB}MB."
            )
        file_name = value.name.lower()
        file_extension = file_name.split(".")[-1] if "." in file_name else ""
        if file_extension not in self.ALLOWED_ATTACHMENT_EXTENSIONS:
            raise serializers.ValidationError(
                f"Invalid file type '.{file_extension}'. Allowed types: {', '.join(self.ALLOWED_ATTACHMENT_EXTENSIONS).upper()}"
            )
        return value

    def validate(self, attrs):
        message = (attrs.get("message") or "").strip()
        attachment = attrs.get("attachment")
        if not message and not attachment:
            raise serializers.ValidationError("Either a message or an attachment must be provided.")
        return attrs

    class Meta:
        model = ChatRoom
        fields = [
            "id",
            "group",
            "student",
            "supervisor",
            "message",
            "attachment",
            "attachment_name",
            "attachment_type",
            "attachment_size",
            "sent_by",
            "created_at",
        ]
        read_only_fields = ["id", "created_at", "sent_by", "student", "supervisor"]

    def create(self, validated_data):
        attachment = validated_data.get("attachment")
        if attachment:
            if not validated_data.get("attachment_name"):
                validated_data["attachment_name"] = attachment.name
            if not validated_data.get("attachment_size"):
                validated_data["attachment_size"] = attachment.size
            if not validated_data.get("attachment_type"):
                validated_data["attachment_type"] = getattr(attachment, "content_type", None) or ""
        return super().create(validated_data)


class PasswordResetRequestSerializer(serializers.Serializer):
    """Serializer for requesting a password reset code."""
    email = serializers.EmailField()

    def validate_email(self, value):
        """Check if a user with this email exists."""
        if not CustomUser.objects.filter(email=value).exists():
            raise serializers.ValidationError(
                "No user found with this email address."
            )
        return value


class PasswordResetConfirmSerializer(serializers.Serializer):
    """Serializer for confirming password reset with the 6-digit code."""
    email = serializers.EmailField()
    code = serializers.CharField(min_length=6, max_length=6)
    new_password = serializers.CharField(min_length=8, write_only=True)
    confirm_password = serializers.CharField(min_length=8, write_only=True)

    def validate_code(self, value):
        """Ensure code contains only digits."""
        if not value.isdigit():
            raise serializers.ValidationError("Code must contain only digits.")
        return value

    def validate(self, attrs):
        """Validate that passwords match."""
        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({
                "confirm_password": "Passwords do not match."
            })
        return attrs


# ==================== Notification Serializers ====================


class NotificationSerializer(serializers.ModelSerializer):
    """Serializer for notifications."""
    
    class Meta:
        model = Notification
        fields = [
            "id",
            "notification_type",
            "title",
            "message",
            "is_read",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "notification_type",
            "title",
            "message",
            "created_at",
        ]


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    """Serializer for notification preferences."""
    
    class Meta:
        model = NotificationPreference
        fields = [
            "group_request_notifications",
            "supervisor_request_notifications",
            "chat_message_notifications",
            "document_notifications",
            "evaluation_notifications",
            "comment_notifications",
            "email_notifications_enabled",
            "email_group_requests",
            "email_supervisor_requests",
            "email_document_updates",
            "email_evaluation_updates",
        ]


class NotificationMarkReadSerializer(serializers.Serializer):
    """Serializer for marking notifications as read."""
    notification_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        help_text="List of notification IDs to mark as read. If empty, marks all as read."
    )


# ==================== Audit Log Serializers ====================


class AuditLogSerializer(serializers.ModelSerializer):
    """Serializer for audit logs."""
    user_username = serializers.CharField(source="user.username", read_only=True)
    user_type = serializers.CharField(source="user.user_type", read_only=True)
    group_info = serializers.SerializerMethodField()
    
    class Meta:
        model = AuditLog
        fields = [
            "id",
            "user",
            "user_username",
            "user_type",
            "action_type",
            "evaluation_type",
            "supervisor_group",
            "group_info",
            "description",
            "field_name",
            "old_value",
            "new_value",
            "created_at",
            "ip_address",
        ]
        read_only_fields = fields
    
    def get_group_info(self, obj):
        if obj.supervisor_group:
            return {
                "id": obj.supervisor_group.id,
                "project_name": obj.supervisor_group.project.project_name if obj.supervisor_group.project else None,
                "student_1": obj.supervisor_group.group.student_1.user.username if obj.supervisor_group.group else None,
                "student_2": obj.supervisor_group.group.student_2.user.username if obj.supervisor_group.group else None,
            }
        return None


# ==================== External Examiner Serializers ====================


class ExternalExaminerUserSerializer(serializers.ModelSerializer):
    """Serializer for External Examiner's user info."""
    class Meta:
        model = CustomUser
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'user_type']
        read_only_fields = ['id', 'user_type']


class ExternalExaminerSerializer(serializers.ModelSerializer):
    """Full External Examiner serializer."""
    user = ExternalExaminerUserSerializer(read_only=True)
    assigned_groups_count = serializers.ReadOnlyField()
    
    class Meta:
        model = ExternalExaminer
        fields = [
            'id', 'user', 'external_id', 'institution', 'designation',
            'specialization', 'contact_number', 'address', 'is_active',
            'assigned_groups_count', 'created_at'
        ]
        read_only_fields = ['id', 'created_at', 'assigned_groups_count']


class ExternalExaminerProfileSerializer(serializers.ModelSerializer):
    """Profile serializer for External Examiner's own view."""
    user = ExternalExaminerUserSerializer(read_only=True)
    external_groups = serializers.SerializerMethodField()
    
    class Meta:
        model = ExternalExaminer
        fields = [
            'id', 'user', 'external_id', 'institution', 'designation',
            'specialization', 'contact_number', 'address', 'is_active',
            'external_groups', 'created_at'
        ]
    
    def get_external_groups(self, obj):
        """Get list of external groups assigned to this examiner."""
        from app.serializers.serializers import ExternalGroupListSerializer
        groups = obj.external_groups.all()
        return ExternalGroupListSerializer(groups, many=True).data


class ExternalExaminerListSerializer(serializers.ModelSerializer):
    """List view serializer for External Examiners."""
    user = ExternalExaminerUserSerializer(read_only=True)
    full_name = serializers.SerializerMethodField()
    
    class Meta:
        model = ExternalExaminer
        fields = ['id', 'user', 'full_name', 'institution', 'designation', 'is_active']
    
    def get_full_name(self, obj):
        return obj.user.get_full_name() or obj.user.username


# ==================== External Group Serializers ====================


class ExternalGroupListSerializer(serializers.ModelSerializer):
    """List view for External Groups."""
    external_examiner_name = serializers.SerializerMethodField()
    assigned_count = serializers.ReadOnlyField()
    available_slots = serializers.ReadOnlyField()
    is_full = serializers.ReadOnlyField()
    
    class Meta:
        model = ExternalGroup
        fields = [
            'id', 'name', 'external_examiner', 'external_examiner_name',
            'semester', 'status', 'max_groups', 'assigned_count',
            'available_slots', 'is_full', 'evaluation_date', 'evaluation_venue'
        ]
    
    def get_external_examiner_name(self, obj):
        return obj.external_examiner.user.get_full_name()


class ExternalGroupAssignmentSerializer(serializers.ModelSerializer):
    """Serializer for group assignment to external."""
    student_group = serializers.SerializerMethodField()
    project_info = serializers.SerializerMethodField()
    supervisor_info = serializers.SerializerMethodField()
    has_evaluation = serializers.SerializerMethodField()
    
    class Meta:
        model = ExternalGroupAssignment
        fields = [
            'id', 'external_group', 'supervisor_group', 'student_group',
            'project_info', 'supervisor_info', 'slot_number', 'slot_time',
            'status', 'has_evaluation', 'assigned_at'
        ]
        read_only_fields = ['id', 'assigned_at']
    
    def get_student_group(self, obj):
        group = obj.supervisor_group.group
        return {
            'id': group.id,
            'student_1': {
                'id': group.student_1.id,
                'name': group.student_1.user.get_full_name(),
                'registration_no': group.student_1.registration_no
            },
            'student_2': {
                'id': group.student_2.id,
                'name': group.student_2.user.get_full_name(),
                'registration_no': group.student_2.registration_no
            } if group.student_2 else None
        }
    
    def get_project_info(self, obj):
        project = obj.supervisor_group.project
        if project:
            return {
                'id': project.id,
                'name': project.project_name,
                'category': project.project_category.category_name if project.project_category else None
            }
        return None
    
    def get_supervisor_info(self, obj):
        supervisor = obj.supervisor_group.supervisor
        if supervisor:
            return {
                'id': supervisor.id,
                'name': supervisor.user.get_full_name()
            }
        return None
    
    def get_has_evaluation(self, obj):
        return hasattr(obj, 'evaluation') and obj.evaluation is not None


class ExternalGroupAssignmentCreateSerializer(serializers.ModelSerializer):
    """Create assignment."""
    class Meta:
        model = ExternalGroupAssignment
        fields = ['external_group', 'supervisor_group', 'slot_number', 'slot_time']
    
    def validate(self, attrs):
        external_group = attrs.get('external_group')
        supervisor_group = attrs.get('supervisor_group')
        
        # Check if external group is full
        if external_group.is_full:
            raise serializers.ValidationError({
                'external_group': 'This external group has reached maximum capacity.'
            })
        
        # Check if supervisor group already assigned
        if ExternalGroupAssignment.objects.filter(
            supervisor_group=supervisor_group
        ).exists():
            raise serializers.ValidationError({
                'supervisor_group': 'This student group is already assigned to an external examiner.'
            })
        
        # Check if supervisor group is eligible (status = accepted)
        if supervisor_group.status != 'accepted':
            raise serializers.ValidationError({
                'supervisor_group': 'Only groups with accepted supervisor status can be assigned.'
            })
        
        return attrs


class ExternalGroupDetailSerializer(serializers.ModelSerializer):
    """Detail view with assignments."""
    external_examiner = ExternalExaminerSerializer(read_only=True)
    assignments = serializers.SerializerMethodField()
    assigned_count = serializers.ReadOnlyField()
    available_slots = serializers.ReadOnlyField()
    
    class Meta:
        model = ExternalGroup
        fields = [
            'id', 'name', 'external_examiner', 'semester', 'status',
            'max_groups', 'assigned_count', 'available_slots',
            'evaluation_date', 'evaluation_venue', 'notes',
            'assignments', 'created_at'
        ]
    
    def get_assignments(self, obj):
        assignments = obj.assignments.select_related(
            'supervisor_group__group__student_1__user',
            'supervisor_group__group__student_2__user',
            'supervisor_group__supervisor__user',
            'supervisor_group__project'
        ).all()
        return ExternalGroupAssignmentSerializer(assignments, many=True).data


class ExternalGroupCreateSerializer(serializers.ModelSerializer):
    """Create/Update External Group."""
    class Meta:
        model = ExternalGroup
        fields = [
            'name', 'external_examiner', 'semester', 'status',
            'max_groups', 'evaluation_date', 'evaluation_venue', 'notes'
        ]
    
    def validate_max_groups(self, value):
        if value < 1 or value > 15:
            raise serializers.ValidationError(
                "Max groups must be between 1 and 15."
            )
        return value


# ==================== External Evaluation Serializers ====================


class ExternalEvaluationSerializer(serializers.ModelSerializer):
    """Full External Evaluation serializer."""
    assignment_info = serializers.SerializerMethodField()
    project_implementation_marks = serializers.ReadOnlyField()
    technical_knowledge_marks = serializers.ReadOnlyField()
    presentation_marks = serializers.ReadOnlyField()
    documentation_marks = serializers.ReadOnlyField()
    qa_marks = serializers.ReadOnlyField()
    total_marks = serializers.ReadOnlyField()
    grade = serializers.ReadOnlyField()
    
    class Meta:
        model = ExternalEvaluation
        fields = [
            'id', 'assignment', 'assignment_info',
            # Project Implementation
            'project_completion', 'code_quality', 'functionality',
            'project_implementation_marks',
            # Technical Knowledge
            'understanding_of_technology', 'problem_solving', 'innovation',
            'technical_knowledge_marks',
            # Presentation
            'presentation_clarity', 'communication', 'time_management',
            'presentation_marks',
            # Documentation
            'documentation_completeness', 'documentation_quality',
            'documentation_marks',
            # Q&A
            'qa_response', 'qa_marks',
            # Totals
            'total_marks', 'grade', 'is_pass',
            # Comments
            'overall_comment', 'strengths', 'areas_of_improvement',
            'evaluated_at', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'assignment_info', 'created_at', 'updated_at']
    
    def get_assignment_info(self, obj):
        return ExternalGroupAssignmentSerializer(obj.assignment).data


class ExternalEvaluationCreateSerializer(serializers.ModelSerializer):
    """Create/Update evaluation."""
    class Meta:
        model = ExternalEvaluation
        fields = [
            'assignment',
            'project_completion', 'code_quality', 'functionality',
            'understanding_of_technology', 'problem_solving', 'innovation',
            'presentation_clarity', 'communication', 'time_management',
            'documentation_completeness', 'documentation_quality',
            'qa_response',
            'overall_comment', 'strengths', 'areas_of_improvement', 'is_pass'
        ]
    
    def validate_assignment(self, value):
        # Check if evaluation already exists
        if self.instance is None:  # Creating new
            if ExternalEvaluation.objects.filter(assignment=value).exists():
                raise serializers.ValidationError(
                    "Evaluation already exists for this assignment."
                )
        return value
    
    def create(self, validated_data):
        from django.utils import timezone
        validated_data['evaluated_at'] = timezone.now()
        return super().create(validated_data)
    
    def update(self, instance, validated_data):
        from django.utils import timezone
        validated_data['evaluated_at'] = timezone.now()
        return super().update(instance, validated_data)


# ==================== Evaluation Schedule Serializers ====================


class EvaluationScheduleSerializer(serializers.ModelSerializer):
    """Serializer for evaluation schedules."""
    external_group_name = serializers.SerializerMethodField()
    panel_name = serializers.SerializerMethodField()
    
    class Meta:
        model = EvaluationSchedule
        fields = [
            'id', 'title', 'evaluation_type', 'semester', 'date',
            'start_time', 'end_time', 'venue', 'status',
            'external_group', 'external_group_name',
            'panel', 'panel_name', 'notes', 'created_at'
        ]
    
    def get_external_group_name(self, obj):
        if obj.external_group:
            return obj.external_group.name
        return None
    
    def get_panel_name(self, obj):
        if obj.panel:
            return getattr(obj.panel, "name", None) or getattr(obj.panel, "panel_name", None)
        return None


class EvaluationScheduleCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating/updating evaluation schedules."""
    class Meta:
        model = EvaluationSchedule
        fields = [
            'title', 'evaluation_type', 'semester', 'date',
            'start_time', 'end_time', 'venue', 'status',
            'external_group', 'panel', 'notes'
        ]
    
    def validate(self, attrs):
        # Ensure end_time is after start_time
        if attrs.get('start_time') and attrs.get('end_time'):
            if attrs['end_time'] <= attrs['start_time']:
                raise serializers.ValidationError({
                    'end_time': 'End time must be after start time.'
                })
        return attrs


class GroupMemberSerializer(serializers.ModelSerializer):
    student = StudentProfileSerializer(read_only=True)
    role_display = serializers.CharField(source="get_role_display", read_only=True)

    class Meta:
        model = GroupMember
        fields = ["id", "student", "role", "role_display", "joined_at"]


class GroupJoinRequestSerializer(serializers.ModelSerializer):
    student = StudentProfileSerializer(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)
    group_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = GroupJoinRequest
        fields = [
            "id",
            "group",
            "group_name",
            "student",
            "message",
            "status",
            "status_display",
            "created_at",
            "updated_at",
        ]

    def get_group_name(self, obj):
        return obj.group.group_name or f"Nhóm #{obj.group.id}"


class ProjectGroupSerializer(serializers.ModelSerializer):
    leader = StudentProfileSerializer(read_only=True)
    academic_batch_name = serializers.SerializerMethodField(read_only=True)
    members = GroupMemberSerializer(many=True, read_only=True)
    current_members_count = serializers.IntegerField(read_only=True)
    is_full = serializers.BooleanField(read_only=True)
    topic_status_display = serializers.CharField(source="get_topic_status_display", read_only=True)
    join_requests = serializers.SerializerMethodField(read_only=True)
    my_join_request = serializers.SerializerMethodField(read_only=True)
    is_my_group = serializers.SerializerMethodField(read_only=True)
    my_role = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Group
        fields = [
            "id",
            "group_name",
            "academic_batch",
            "academic_batch_name",
            "leader",
            "max_members",
            "current_members_count",
            "is_recruiting",
            "is_full",
            "tentative_topic",
            "tentative_description",
            "topic_status",
            "topic_status_display",
            "topic_revision_notes",
            "members",
            "join_requests",
            "my_join_request",
            "is_my_group",
            "my_role",
        ]

    def get_academic_batch_name(self, obj):
        return str(obj.academic_batch) if obj.academic_batch else ""

    def get_join_requests(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            try:
                student = Student.objects.get(user=request.user)
                if (obj.leader == student) or (obj.student_1 == student):
                    requests = obj.join_requests.filter(status="PENDING").order_by("-created_at")
                    return GroupJoinRequestSerializer(requests, many=True, context=self.context).data
            except Student.DoesNotExist:
                pass
        return []

    def get_my_join_request(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            try:
                student = Student.objects.get(user=request.user)
                join_req = obj.join_requests.filter(student=student).order_by("-created_at").first()
                if join_req:
                    return GroupJoinRequestSerializer(join_req, context=self.context).data
            except Student.DoesNotExist:
                pass
        return None

    def get_is_my_group(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            try:
                student = Student.objects.get(user=request.user)
                return obj.members.filter(student=student).exists() or obj.student_1 == student or obj.student_2 == student
            except Student.DoesNotExist:
                pass
        return False

    def get_my_role(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            try:
                student = Student.objects.get(user=request.user)
                m = obj.members.filter(student=student).first()
                if m:
                    return m.role
                if obj.student_1 == student or obj.leader == student:
                    return "LEADER"
                if obj.student_2 == student:
                    return "MEMBER"
            except Student.DoesNotExist:
                pass
        return None

class SystemBugReportSerializer(serializers.ModelSerializer):
    """Serializer cho module báo lỗi hệ thống kèm kiểm tra nhị phân ảnh chụp màn hình"""
    username = serializers.CharField(source="user.username", read_only=True)
    user_full_name = serializers.SerializerMethodField(read_only=True)
    status_display = serializers.CharField(source="get_status_display", read_only=True)

    class Meta:
        model = SystemBugReport
        fields = [
            "id",
            "user",
            "username",
            "user_full_name",
            "title",
            "description",
            "page_url",
            "screenshot",
            "status",
            "status_display",
            "admin_notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "user", "status", "admin_notes", "created_at", "updated_at"]

    def get_user_full_name(self, obj):
        if obj.user:
            return obj.user.get_full_name() or obj.user.username
        return "Khách"

    def validate_screenshot(self, value):
        if value is None:
            return value
        return validate_uploaded_file(
            value,
            allowed_extensions=[".png", ".jpg", ".jpeg", ".webp"],
            max_size_bytes=15 * 1024 * 1024  # 15MB
        )
