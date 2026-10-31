import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { TablePagination } from './TablePagination';
import { getRelativeTime } from '../utils/dateUtils';
import { useModalGuard } from '../utils/modalHooks';
import { apiService } from '../services/api';
import { calculateStageCounts, getProjectStageNumber } from '../utils/graduationStages';
import { SupervisorOfferedTopics } from './SupervisorOfferedTopics';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/app';

export type SupervisorGradTab = 'students' | 'survey' | 'outlines' | 'weekly' | 'supervision' | 'eval' | 'reviewer' | 'deferrals';

export interface UTCSupervisorGraduationViewProps {
  initialTab?: SupervisorGradTab;
  onSubtabChange?: (tab: SupervisorGradTab) => void;
  onProjectsLoaded?: (projects: any[]) => void;
}

export const UTCSupervisorGraduationView: React.FC<UTCSupervisorGraduationViewProps> = ({
  initialTab,
  onSubtabChange,
  onProjectsLoaded,
}) => {
  const [activeTab, setActiveTab] = useState<SupervisorGradTab>(initialTab || 'students');
  const [projects, setProjects] = useState<any[]>([]);
  const [reviewerProjects, setReviewerProjects] = useState<any[]>([]);
  const [outlineReviews, setOutlineReviews] = useState<any[]>([]);
  const [deferralRequests, setDeferralRequests] = useState<any[]>([]);
  const [reviewingDeferral, setReviewingDeferral] = useState(false);
  const [adminTopicModal, setAdminTopicModal] = useState<any>(null);
  const [adminTopicNotes, setAdminTopicNotes] = useState('');
  const [adminTopicSubmitting, setAdminTopicSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Sync with initialTab prop if changed from outside
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const handleSelectTab = (tab: SupervisorGradTab) => {
    setActiveTab(tab);
    setStudentPage(1);
    if (onSubtabChange) {
      onSubtabChange(tab);
    }
  };

  const stageCounts = useMemo(() => calculateStageCounts(projects), [projects]);

  // Each stage tab must only list the students that are actually in that stage.
  const projectsByStage = useMemo(() => {
    const map: Record<number, any[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    projects.forEach((p) => {
      const stage = getProjectStageNumber(p);
      if (!map[stage]) map[stage] = [];
      map[stage].push(p);
    });
    return map;
  }, [projects]);

  const stage1Projects = projectsByStage[1] || [];
  const stage4Projects = projectsByStage[4] || [];
  const stage5Projects = projectsByStage[5] || [];

  // Outline reviews for Stage 2 (and any assigned review groups)
  const filteredOutlineReviews = useMemo(
    () =>
      outlineReviews.filter((r) => {
        return Boolean(r.project);
      }),
    [outlineReviews]
  );

  // Sorting & Pagination for Students Table
  const [sortField, setSortField] = useState<'student_name' | 'created_at' | 'supervisor_score' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [studentPage, setStudentPage] = useState(1);
  const [studentPageSize, setStudentPageSize] = useState(10);

  // Outline Review Modal
  const [selectedProject, setSelectedProject] = useState<any>(null);
  const [verdict, setVerdict] = useState<'APPROVED' | 'REVISION_REQUIRED' | 'REJECTED'>('APPROVED');
  const [outlineComments, setOutlineComments] = useState('');
  const [showOutlineModal, setShowOutlineModal] = useState(false);

  // Weekly Feedback Modal
  const [selectedReport, setSelectedReport] = useState<any>(null);
  const [weeklyRating, setWeeklyRating] = useState<'GOOD' | 'ACCEPTABLE' | 'LATE' | 'UNSATISFACTORY'>('GOOD');
  const [weeklyFeedback, setWeeklyFeedback] = useState('');
  const [showWeeklyModal, setShowWeeklyModal] = useState(false);

  // Supervisor Defense Evaluation Modal
  const [showEvalModal, setShowEvalModal] = useState(false);
  const [evalScore, setEvalScore] = useState('');
  const [evalFeedback, setEvalFeedback] = useState('');
  const [isEligible, setIsEligible] = useState(true);
  const [evalFilter, setEvalFilter] = useState<'ALL' | 'PENDING' | 'ELIGIBLE'>('ALL');

  const countEvalPending = useMemo(() => {
    return projects.filter((p) => !p.is_eligible_for_defense && (p.supervisor_score === null || p.supervisor_score === undefined)).length;
  }, [projects]);

  const countEvalEligible = useMemo(() => {
    return projects.filter((p) => Boolean(p.is_eligible_for_defense)).length;
  }, [projects]);

  const evaluatableProjects = useMemo(() => {
    return projects.filter((p) => {
      if (evalFilter === 'PENDING') {
        return !p.is_eligible_for_defense && (p.supervisor_score === null || p.supervisor_score === undefined);
      }
      if (evalFilter === 'ELIGIBLE') {
        return Boolean(p.is_eligible_for_defense);
      }
      return true;
    });
  }, [projects, evalFilter]);

  // Reviewer Score Modal
  const [showReviewerModal, setShowReviewerModal] = useState(false);
  const [revScore, setRevScore] = useState('');
  const [revFeedback, setRevFeedback] = useState('');
  const [revVerdict, setRevVerdict] = useState<'APPROVED' | 'CONDITIONAL' | 'REJECTED'>('APPROVED');

  // Supervision Meeting Logs & Tasks Modal State
  const [showSupervisionModal, setShowSupervisionModal] = useState(false);
  const [supervisionProject, setSupervisionProject] = useState<any>(null);
  const [supervisionLogs, setSupervisionLogs] = useState<any[]>([]);
  const [supervisionTasks, setSupervisionTasks] = useState<any[]>([]);
  const [supervisionSubTab, setSupervisionSubTab] = useState<'logs' | 'tasks'>('tasks');
  const [loadingSupervision, setLoadingSupervision] = useState(false);

  // New Log Form State
  const [meetingDate, setMeetingDate] = useState(new Date().toISOString().split('T')[0]);
  const [meetingTime, setMeetingTime] = useState('09:00 - 10:30');
  const [meetingType, setMeetingType] = useState<'OFFLINE' | 'ONLINE'>('OFFLINE');
  const [locationOrLink, setLocationOrLink] = useState('');
  const [contentDiscussed, setContentDiscussed] = useState('');
  const [supervisorNotes, setSupervisorNotes] = useState('');
  const [nextMeetingPlan, setNextMeetingPlan] = useState('');
  const [savingLog, setSavingLog] = useState(false);
  const [showAddLogForm, setShowAddLogForm] = useState(false);

  // Next week task assignment in meeting log form (Feature 5)
  const [logAssignTask, setLogAssignTask] = useState(false);
  const [logTaskTitle, setLogTaskTitle] = useState('');
  const [logTaskDesc, setLogTaskDesc] = useState('');
  const [logTaskDueDate, setLogTaskDueDate] = useState('');
  const [logTaskPriority, setLogTaskPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');

  // New Task Form State
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskPriority, setTaskPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
  const [savingTask, setSavingTask] = useState(false);
  const [showAddTaskForm, setShowAddTaskForm] = useState(false);

  // Topic Confirmation Modal State (GĐ 2: GVHD Thẩm định & Duyệt đề tài)
  const [selectedTopicProject, setSelectedTopicProject] = useState<any>(null);
  const [topicConfirmVi, setTopicConfirmVi] = useState('');
  const [topicConfirmEn, setTopicConfirmEn] = useState('');
  const [topicConfirmDecision, setTopicConfirmDecision] = useState<'APPROVE' | 'REVISION'>('APPROVE');
  const [topicConfirmNotes, setTopicConfirmNotes] = useState('');
  const [confirmingTopic, setConfirmingTopic] = useState(false);
  const [showTopicConfirmModal, setShowTopicConfirmModal] = useState(false);

  // Task Review Modal State (Phase 5)
  const [selectedTaskForReview, setSelectedTaskForReview] = useState<any>(null);
  const [taskReviewVerdict, setTaskReviewVerdict] = useState<'ACCEPTED' | 'REVISION_REQUIRED'>('ACCEPTED');
  const [taskReviewNotes, setTaskReviewNotes] = useState('');
  const [reviewingTask, setReviewingTask] = useState(false);
  const [showTaskReviewModal, setShowTaskReviewModal] = useState(false);


  // Modal Guards with ESC & dirty form protection
  const outlineGuard = useModalGuard({
    isOpen: showOutlineModal,
    onClose: () => setShowOutlineModal(false),
    isDirty: Boolean(outlineComments.trim()),
  });

  const weeklyGuard = useModalGuard({
    isOpen: showWeeklyModal,
    onClose: () => setShowWeeklyModal(false),
    isDirty: Boolean(weeklyFeedback.trim()),
  });

  const evalGuard = useModalGuard({
    isOpen: showEvalModal,
    onClose: () => setShowEvalModal(false),
    isDirty: Boolean(evalScore !== '' || evalFeedback.trim()),
  });

  const reviewerGuard = useModalGuard({
    isOpen: showReviewerModal,
    onClose: () => setShowReviewerModal(false),
    isDirty: Boolean(revScore !== '' || revFeedback.trim()),
  });

  const supervisionGuard = useModalGuard({
    isOpen: showSupervisionModal,
    onClose: () => setShowSupervisionModal(false),
    isDirty: Boolean(contentDiscussed.trim() || supervisorNotes.trim() || taskTitle.trim() || taskDesc.trim()),
  });

  // Sorting & Pagination Helpers
  const handleSort = (field: 'student_name' | 'created_at' | 'supervisor_score') => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setStudentPage(1);
  };

  const renderSortIcon = (field: 'student_name' | 'created_at' | 'supervisor_score') => {
    if (sortField !== field) {
      return <span style={{ color: '#64748b', marginLeft: '4px', fontSize: '11px' }}>⇅</span>;
    }
    return sortDirection === 'asc' ? (
      <span style={{ color: '#38bdf8', marginLeft: '4px', fontWeight: 'bold', fontSize: '11px' }}>▲</span>
    ) : (
      <span style={{ color: '#38bdf8', marginLeft: '4px', fontWeight: 'bold', fontSize: '11px' }}>▼</span>
    );
  };

  const sortedProjects = useMemo(() => {
    if (!sortField) return stage1Projects;
    return [...stage1Projects].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (sortField === 'student_name') {
        const strA = (valA || a.student_name || '').toString();
        const strB = (valB || b.student_name || '').toString();
        const cmp = strA.localeCompare(strB, 'vi', { sensitivity: 'base' });
        return sortDirection === 'asc' ? cmp : -cmp;
      }

      if (sortField === 'created_at') {
        const timeA = valA ? new Date(valA).getTime() : 0;
        const timeB = valB ? new Date(valB).getTime() : 0;
        return sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
      }

      if (sortField === 'supervisor_score') {
        const numA = valA !== null && valA !== undefined ? Number(valA) : -1;
        const numB = valB !== null && valB !== undefined ? Number(valB) : -1;
        return sortDirection === 'asc' ? numA - numB : numB - numA;
      }

      return 0;
    });
  }, [stage1Projects, sortField, sortDirection]);

  const paginatedProjects = useMemo(() => {
    const start = (studentPage - 1) * studentPageSize;
    return sortedProjects.slice(start, start + studentPageSize);
  }, [sortedProjects, studentPage, studentPageSize]);

  const getHeaders = () => {
    const token = localStorage.getItem('access_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [projRes, revRes, outRes, defRes] = await Promise.all([
        axios.get(`${API_BASE}/supervisor/graduation-projects/`, { headers: getHeaders() }).catch(() => null),
        axios.get(`${API_BASE}/reviewer/assigned-projects/`, { headers: getHeaders() }).catch(() => null),
        axios.get(`${API_BASE}/supervisor/outline-group-reviews/`, { headers: getHeaders() }).catch(() => null),
        apiService.getAdminDeferralRequests().catch(() => []),
      ]);
      if (projRes?.data) {
        setProjects(projRes.data);
        if (onProjectsLoaded) {
          onProjectsLoaded(projRes.data);
        }
      }
      if (revRes?.data) setReviewerProjects(revRes.data);
      if (outRes?.data) setOutlineReviews(outRes.data);
      if (defRes) setDeferralRequests(Array.isArray(defRes) ? defRes : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenSupervision = async (project: any) => {
    setSupervisionProject(project);
    setShowSupervisionModal(true);
    setLoadingSupervision(true);
    setShowAddLogForm(false);
    setShowAddTaskForm(false);
    try {
      const [logsRes, tasksRes] = await Promise.all([
        axios.get(`${API_BASE}/supervisor/supervision-logs/?project_id=${project.id}`, { headers: getHeaders() }).catch(() => null),
        axios.get(`${API_BASE}/supervisor/tasks/?project_id=${project.id}`, { headers: getHeaders() }).catch(() => null),
      ]);
      if (logsRes?.data) setSupervisionLogs(logsRes.data);
      if (tasksRes?.data) setSupervisionTasks(tasksRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingSupervision(false);
    }
  };

  const handleCreateMeetingLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supervisionProject || !contentDiscussed) return;

    if (meetingType === 'ONLINE' && !locationOrLink.trim()) {
      alert('Vui lòng nhập link cuộc họp trực tuyến Google Meet hoặc Zoom.');
      return;
    }

    if (logAssignTask && !logTaskTitle.trim()) {
      alert('Vui lòng nhập tên công việc tuần tới nếu đã chọn giao việc.');
      return;
    }

    try {
      setSavingLog(true);
      const payload: any = {
        project_id: supervisionProject.id,
        meeting_date: meetingDate,
        meeting_time: meetingTime,
        meeting_type: meetingType,
        location_or_link: locationOrLink.trim(),
        content_discussed: contentDiscussed.trim(),
        supervisor_notes: supervisorNotes.trim(),
        next_meeting_plan: nextMeetingPlan.trim(),
      };

      if (logAssignTask && logTaskTitle.trim()) {
        payload.task_title = logTaskTitle.trim();
        payload.task_description = logTaskDesc.trim();
        payload.task_due_date = logTaskDueDate || null;
        payload.task_priority = logTaskPriority;
      }

      const res = await axios.post(
        `${API_BASE}/supervisor/supervision-logs/`,
        payload,
        { headers: getHeaders() }
      );
      alert(res.data?.message || 'Đã lưu nhật ký hướng dẫn và căn cứ đánh giá điểm quá trình thành công!');
      setContentDiscussed('');
      setSupervisorNotes('');
      setNextMeetingPlan('');
      setLocationOrLink('');
      setLogAssignTask(false);
      setLogTaskTitle('');
      setLogTaskDesc('');
      setLogTaskDueDate('');
      setShowAddLogForm(false);

      const [logsRes, tasksRes] = await Promise.all([
        axios.get(`${API_BASE}/supervisor/supervision-logs/?project_id=${supervisionProject.id}`, { headers: getHeaders() }),
        axios.get(`${API_BASE}/supervisor/tasks/?project_id=${supervisionProject.id}`, { headers: getHeaders() }),
      ]);
      if (logsRes?.data) setSupervisionLogs(logsRes.data);
      if (tasksRes?.data) setSupervisionTasks(tasksRes.data);
    } catch (err: any) {
      alert('Lỗi lưu nhật ký: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSavingLog(false);
    }
  };


  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supervisionProject || !taskTitle) return;
    try {
      setSavingTask(true);
      const res = await axios.post(
        `${API_BASE}/supervisor/tasks/`,
        {
          project_id: supervisionProject.id,
          title: taskTitle,
          description: taskDesc,
          due_date: taskDueDate || null,
          priority: taskPriority,
        },
        { headers: getHeaders() }
      );
      alert(res.data?.message || 'Đã giao nhiệm vụ cho sinh viên!');
      setTaskTitle('');
      setTaskDesc('');
      setTaskDueDate('');
      setShowAddTaskForm(false);
      const tasksRes = await axios.get(`${API_BASE}/supervisor/tasks/?project_id=${supervisionProject.id}`, { headers: getHeaders() });
      if (tasksRes?.data) setSupervisionTasks(tasksRes.data);
    } catch (err: any) {
      alert('Lỗi giao việc: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSavingTask(false);
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    if (!confirm('Bạn có chắc chắn muốn xóa nhiệm vụ này?')) return;
    try {
      await axios.delete(`${API_BASE}/supervisor/tasks/${taskId}/`, { headers: getHeaders() });
      setSupervisionTasks(supervisionTasks.filter((t) => t.id !== taskId));
    } catch (err: any) {
      alert('Lỗi xóa nhiệm vụ: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleOpenTopicConfirm = (project: any) => {
    setSelectedTopicProject(project);
    setTopicConfirmVi(project.topic_title_vi || '');
    setTopicConfirmEn(project.topic_title_en || '');
    setTopicConfirmDecision('APPROVE');
    setTopicConfirmNotes(project.topic_revision_notes || '');
    setShowTopicConfirmModal(true);
  };

  const handleConfirmTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTopicProject || !topicConfirmVi.trim()) return;
    try {
      setConfirmingTopic(true);
      await apiService.confirmTopicBySupervisor({
        project_id: selectedTopicProject.id,
        topic_title_vi: topicConfirmVi.trim(),
        topic_title_en: topicConfirmEn.trim(),
        decision: topicConfirmDecision,
        notes: topicConfirmNotes,
      });
      alert(topicConfirmDecision === 'APPROVE'
        ? 'Đã thẩm định và DUYỆT ĐẠT đề tài thành công! Sinh viên chuyển sang bước hoàn thiện đề cương theo mẫu.'
        : 'Đã gửi yêu cầu sinh viên chỉnh sửa hoặc chọn đề tài khác.'
      );
      setShowTopicConfirmModal(false);
      fetchData();
    } catch (err: any) {
      alert('Lỗi thẩm định đề tài: ' + (err.response?.data?.detail || err.message));
    } finally {
      setConfirmingTopic(false);
    }
  };

  // FLOW_24: Khoa duyệt đơn xin bảo lưu đồ án
  const handleReviewDeferral = async (reqId: number, decision: 'APPROVED' | 'REJECTED') => {
    let notes = '';
    if (decision === 'REJECTED') {
      const promptNotes = window.prompt('Vui lòng nhập lý do từ chối bảo lưu:');
      if (promptNotes === null) return;
      notes = promptNotes.trim();
    }
    try {
      setReviewingDeferral(true);
      const res = await apiService.adminReviewDeferralRequest(reqId, {
        decision,
        admin_notes: notes || (decision === 'APPROVED' ? 'Khoa chấp thuận bảo lưu đồ án tốt nghiệp' : 'Không chấp thuận bảo lưu')
      });
      alert(res.message || 'Cập nhật trạng thái bảo lưu thành công! (Trạng thái đồ án: ' + (res.project?.status || 'DEFERRED') + ')');
      fetchData();
    } catch (err: any) {
      alert('Lỗi duyệt bảo lưu: ' + (err.response?.data?.detail || err.message));
    } finally {
      setReviewingDeferral(false);
    }
  };

  // FLOW_14 & TC_034: Khoa duyệt đề tài chính thức
  const handleAdminApproveTopic = async (project: any, decision: 'APPROVED' | 'REJECTED') => {
    if (decision === 'REJECTED') {
      setAdminTopicModal(project);
      setAdminTopicNotes('');
      return;
    }
    if (!window.confirm(`Xác nhận Khoa phê duyệt chính thức đề tài cho sinh viên ${project.student_name}?`)) return;
    try {
      setAdminTopicSubmitting(true);
      const res = await apiService.adminApproveTopic({
        project_id: project.id,
        decision: 'APPROVED'
      });
      alert(res.message || 'Khoa đã phê duyệt đề tài chính thức thành công!');
      fetchData();
    } catch (err: any) {
      alert('Lỗi phê duyệt đề tài: ' + (err.response?.data?.detail || err.message));
    } finally {
      setAdminTopicSubmitting(false);
    }
  };

  const handleSubmitAdminTopicReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminTopicModal) return;
    // FLOW_14: Frontend validation - bắt buộc có lý do từ chối
    if (!adminTopicNotes.trim()) {
      alert('Vui lòng nhập lý do từ chối hoặc yêu cầu chỉnh sửa đề tài! Không được để trống lý do.');
      return;
    }
    try {
      setAdminTopicSubmitting(true);
      const res = await apiService.adminApproveTopic({
        project_id: adminTopicModal.id,
        decision: 'REJECTED',
        notes: adminTopicNotes.trim()
      });
      alert(res.message || 'Khoa đã gửi yêu cầu chỉnh sửa đề tài thành công!');
      setAdminTopicModal(null);
      setAdminTopicNotes('');
      fetchData();
    } catch (err: any) {
      alert('Lỗi từ chối đề tài: ' + (err.response?.data?.detail || err.message));
    } finally {
      setAdminTopicSubmitting(false);
    }
  };

  const handleOpenTaskReview = (task: any) => {
    setSelectedTaskForReview(task);
    setTaskReviewVerdict(task.review_verdict === 'REVISION_REQUIRED' ? 'REVISION_REQUIRED' : 'ACCEPTED');
    setTaskReviewNotes(task.supervisor_review_notes || '');
    setShowTaskReviewModal(true);
  };

  const handleSubmitTaskReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskForReview) return;
    try {
      setReviewingTask(true);
      await apiService.supervisorReviewTask(selectedTaskForReview.id, {
        verdict: taskReviewVerdict,
        supervisor_notes: taskReviewNotes.trim(),
      });
      alert('Đã lưu kết quả đánh giá nhiệm vụ thành công!');
      setShowTaskReviewModal(false);
      if (supervisionProject) {
        const tasksRes = await axios.get(`${API_BASE}/supervisor/tasks/?project_id=${supervisionProject.id}`, { headers: getHeaders() });
        if (tasksRes?.data) setSupervisionTasks(tasksRes.data);
      }
    } catch (err: any) {
      alert('Lỗi đánh giá nhiệm vụ: ' + (err.response?.data?.detail || err.message));
    } finally {
      setReviewingTask(false);
    }
  };

  const handleReviewOutline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;
    try {
      await axios.post(
        `${API_BASE}/supervisor/outline/review/`,
        {
          project_id: selectedProject.id,
          verdict,
          comments: outlineComments,
        },
        { headers: getHeaders()}
      );
      alert('Đã cập nhật kết quả duyệt đề cương!');
      setShowOutlineModal(false);
      fetchData();
    } catch (err: any) {
      alert('Lỗi: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleFeedbackWeekly = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReport) return;
    try {
      await axios.post(
        `${API_BASE}/supervisor/weekly-feedback/`,
        {
          report_id: selectedReport.id,
          rating: weeklyRating,
          feedback: weeklyFeedback,
        },
        { headers: getHeaders()}
      );
      alert('Đã lưu nhận xét và đánh giá tiến độ tuần!');
      setShowWeeklyModal(false);
      fetchData();
    } catch (err: any) {
      alert('Lỗi: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleSupervisorEvaluation = async (isDraft: boolean = false) => {
    if (!selectedProject) return;
    if (evalScore === '' || isNaN(Number(evalScore))) {
      alert('Vui lòng nhập điểm hướng dẫn hợp lệ (0 - 10).');
      return;
    }
    try {
      await axios.post(
        `${API_BASE}/supervisor/defense-evaluation/`,
        {
          project_id: selectedProject.id,
          supervisor_score: Number(evalScore),
          supervisor_feedback: evalFeedback,
          is_eligible_for_defense: isEligible,
          is_draft: isDraft,
        },
        { headers: getHeaders()}
      );
      if (isDraft) {
        alert('Đã lưu nháp phiếu đánh giá GVHD thành công! Điểm chưa được công bố cho sinh viên.');
      } else {
        alert('Đã lưu phiếu đánh giá GVHD chính thức thành công!');
      }
      setShowEvalModal(false);
      fetchData();
    } catch (err: any) {
      alert('Lỗi: ' + (err.response?.data?.supervisor_score?.[0] || err.message));
    }
  };

  const handleReviewerEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;
    try {
      await axios.post(
        `${API_BASE}/reviewer/submit-evaluation/`,
        {
          project_id: selectedProject.id,
          reviewer_score: Number(revScore),
          reviewer_feedback: revFeedback,
          reviewer_verdict: revVerdict,
        },
        { headers: getHeaders()}
      );
      alert('Đã lưu phiếu phản biện và kết luận thành công!');
      setShowReviewerModal(false);
      fetchData();
    } catch (err: any) {
      alert('Lỗi: ' + (err.response?.data?.reviewer_score?.[0] || err.message));
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400">Đang tải danh sách sinh viên hướng dẫn...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Navigation Tabs (Aligned with 6 UTC Stages + Student Counts) */}
      <div className="flex flex-wrap gap-2 border-b border-slate-700/60 pb-3">
        {[
          { key: 'students' as SupervisorGradTab, label: `GĐ 1: Phân Công SV (${stageCounts[1] || 0})`, icon: '🎓' },
          { key: 'outlines' as SupervisorGradTab, label: `GĐ 2: Duyệt Đề Tài & Đề Cương (${filteredOutlineReviews.length})`, icon: '📄' },
          { key: 'supervision' as SupervisorGradTab, label: `GĐ 3: Task & Điểm Quá Trình (${stageCounts[3] || 0})`, icon: '📋' },
          { key: 'weekly' as SupervisorGradTab, label: `Báo Cáo Tuần (${stageCounts[3] || 0})`, icon: '📅' },
          { key: 'survey' as SupervisorGradTab, label: `Đề Tài Gợi Ý Của GV`, icon: '📝' },
          { key: 'eval' as SupervisorGradTab, label: `GĐ 6: Đánh Giá & HĐ (${countEvalEligible}/${projects.length})`, icon: '🏆' },
          { key: 'reviewer' as SupervisorGradTab, label: `Đồ Án Phản Biện (${reviewerProjects.length})`, icon: '🔍' },
          { key: 'deferrals' as SupervisorGradTab, label: `Đơn Bảo Lưu (${deferralRequests.length})`, icon: '📑' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleSelectTab(tab.key)}
            className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition flex items-center gap-2 ${
              activeTab === tab.key
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab 1: Students List */}
      {activeTab === 'students' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="font-bold text-base text-slate-100">
              Danh sách Sinh viên Giai đoạn 1 - Đề tài & Phân công ({stage1Projects.length})
            </h3>
            <span className="text-xs text-slate-400">
              💡 Bấm vào tiêu đề cột <b>"Tên"</b>, <b>"Ngày tạo"</b>, <b>"Điểm số"</b> để sắp xếp Tăng dần / Giảm dần.
            </span>
          </div>

          {stage1Projects.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">Chưa có sinh viên nào ở Giai đoạn 1.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase font-semibold">
                  <tr>
                    <th className="p-3">MSSV</th>
                    <th
                      className="p-3 cursor-pointer select-none hover:text-blue-400 transition"
                      onClick={() => handleSort('student_name')}
                      title="Bấm để sắp xếp theo Tên sinh viên"
                    >
                      Tên {renderSortIcon('student_name')}
                    </th>
                    <th
                      className="p-3 cursor-pointer select-none hover:text-blue-400 transition"
                      onClick={() => handleSort('created_at')}
                      title="Bấm để sắp xếp theo Ngày tạo"
                    >
                      Ngày tạo {renderSortIcon('created_at')}
                    </th>
                    <th
                      className="p-3 cursor-pointer select-none hover:text-blue-400 transition"
                      onClick={() => handleSort('supervisor_score')}
                      title="Bấm để sắp xếp theo Điểm số"
                    >
                      Điểm số {renderSortIcon('supervisor_score')}
                    </th>
                    <th className="p-3">Lớp / Ngành</th>
                    <th className="p-3">Tên đề tài đồ án</th>
                    <th className="p-3">Điện thoại / Email</th>
                    <th className="p-3">Trạng thái</th>
                    <th className="p-3 text-right">Hướng dẫn & Nhiệm vụ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {paginatedProjects.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-950/40">
                      <td className="p-3 font-mono font-semibold text-blue-400">{p.student_reg_no}</td>
                      <td className="p-3 font-medium text-slate-100">{p.student_name}</td>
                      <td
                        className="p-3 text-slate-400 whitespace-nowrap"
                        title={p.created_at ? new Date(p.created_at).toLocaleString('vi-VN') : ''}
                      >
                        {p.created_at ? getRelativeTime(p.created_at) : 'Mới tạo'}
                      </td>
                      <td className="p-3 font-semibold text-emerald-400">
                        {p.supervisor_score !== null && p.supervisor_score !== undefined ? (
                          `${p.supervisor_score} / 10đ`
                        ) : (
                          <span className="text-slate-500 font-normal">Chưa chấm</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-400">{p.student_class}</td>
                      <td className="p-3 font-medium text-slate-200 max-w-xs">{p.topic_title_vi}</td>
                      <td className="p-3 text-slate-400">
                        <div>{p.student_phone || 'N/A'}</div>
                        <div className="text-slate-500">{p.student_email}</div>
                      </td>
                      <td className="p-3">
                        <div className="space-y-1">
                          <span className={`px-2 py-0.5 rounded text-xs block w-fit border ${
                            p.status === 'TOPIC_APPROVED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 font-semibold' :
                            p.status === 'TOPIC_CONFIRMED' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20 font-semibold' :
                            p.status === 'TOPIC_REVISION' ? 'bg-rose-500/15 text-rose-300 border-rose-500/30 font-semibold' :
                            p.status === 'TOPIC_DRAFT' ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 font-semibold' :
                            'bg-slate-800 text-slate-300 border-slate-700'
                          }`}>
                            {p.status_display || p.status}
                          </span>
                          {(p.status === 'TOPIC_DRAFT' || p.status === 'TOPIC_REVISION') && (
                            <button
                              onClick={() => handleOpenTopicConfirm(p)}
                              className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-[11px] font-semibold transition flex items-center gap-1"
                              title="GV xác nhận đề tài sau khi thảo luận với sinh viên"
                            >
                              <span>✏️</span> Xác nhận đề tài
                            </button>
                          )}
                          {(p.status === 'TOPIC_CONFIRMED' || p.status === 'PENDING_REVIEW') && (
                            <div className="flex items-center gap-1.5 pt-0.5">
                              <button
                                onClick={() => handleAdminApproveTopic(p, 'APPROVED')}
                                disabled={adminTopicSubmitting}
                                className="px-2 py-0.5 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold transition flex items-center gap-1"
                                title="Khoa phê duyệt chính thức đề tài"
                              >
                                <span>✓</span> Khoa Duyệt
                              </button>
                              <button
                                onClick={() => handleAdminApproveTopic(p, 'REJECTED')}
                                disabled={adminTopicSubmitting}
                                className="px-2 py-0.5 rounded bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 border border-rose-500/40 text-[11px] font-bold transition flex items-center gap-1"
                                title="Khoa yêu cầu sửa / từ chối đề tài"
                              >
                                <span>✕</span> Từ chối
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => handleOpenSupervision(p)}
                          className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-semibold transition inline-flex items-center gap-1.5"
                        >
                          <span>📋</span>
                          <span>Nhật ký & Giao việc</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <TablePagination
                currentPage={studentPage}
                pageSize={studentPageSize}
                totalItems={sortedProjects.length}
                onPageChange={setStudentPage}
                onPageSizeChange={(newSize) => {
                  setStudentPageSize(newSize);
                  setStudentPage(1);
                }}
                pageSizeOptions={[10, 25, 50]}
              />
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Survey & Offered Topics */}
      {activeTab === 'survey' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                  <span>📝</span>
                  <span>Giai Đoạn 2: Khảo Sát Nguyện Vọng & Đề Tài Gợi Ý Của Giảng Viên</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Đề xuất các hướng nghiên cứu và đề tài gợi ý để sinh viên đăng ký trong đợt khảo sát nguyện vọng ban đầu.
                </p>
              </div>
              <span className="text-xs px-3 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold">
                Hiện có {stageCounts[2] || 0} sinh viên ở giai đoạn này
              </span>
            </div>
            <SupervisorOfferedTopics onTopicChanged={fetchData} />
          </div>
        </div>
      )}

      {/* GĐ 2: Thẩm Định Đề Tài & Phê Duyệt Đề Cương Theo Template */}
      {activeTab === 'outlines' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <span>📄</span>
                <span>Giai Đoạn 2: Thẩm Định Đề Tài & Phê Duyệt Đề Cương Theo Template ({filteredOutlineReviews.length})</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                GVHD thẩm định tên đề tài & mục tiêu, đọc nội dung đề cương sinh viên điền theo mẫu template chuẩn UTC và phê duyệt trên hệ thống.
              </p>
            </div>
            <span className="text-xs px-3 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold">
              Hiện có {filteredOutlineReviews.length} đề cương cần theo dõi / thẩm định
            </span>
          </div>

          {filteredOutlineReviews.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">Chưa có đề cương nào được nộp trong danh sách phân công của Thầy/Cô.</div>
          ) : (
            <div className="space-y-3">
              {filteredOutlineReviews.map((r) => (
                <div key={r.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1 min-w-[280px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-blue-400">{r.student_reg_no}</span>
                      <span className="font-semibold text-sm text-slate-100">{r.student_name}</span>
                      <span className={`text-xs px-2.5 py-0.5 rounded font-bold ${
                        r.verdict === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                        r.verdict === 'REVISION_REQUIRED' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                        r.verdict === 'REJECTED' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
                        'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                      }`}>
                        {r.verdict === 'APPROVED' ? '✅ Đã duyệt' : 
                         r.verdict === 'REVISION_REQUIRED' ? '⚠️ Yêu cầu sửa' : 
                         r.verdict === 'REJECTED' ? '❌ Không đạt' : '⏳ Chờ thẩm định'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-200">
                      <b>Đề tài:</b> {r.topic_title || <span className="text-slate-500 italic">Chưa nhập tên đề tài</span>}
                    </p>
                    {r.template_data?.topic_objective && (
                      <p className="text-[11px] text-slate-400 line-clamp-1">
                        <b>Mục tiêu cốt lõi:</b> {r.template_data.topic_objective}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-500">
                      <b>Nhóm thẩm định:</b> {r.group_name || 'Bộ môn'} {r.reviewer_name ? `• Người duyệt: ${r.reviewer_name}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const blob = await apiService.exportOutlinePdf(r.project);
                          const url = window.URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = `De_cuong_${r.student_reg_no || 'UTC'}.pdf`;
                          document.body.appendChild(link);
                          link.click();
                          link.remove();
                          window.URL.revokeObjectURL(url);
                        } catch (err: any) {
                          alert('Lỗi tải file đề cương: ' + (err.response?.data?.detail || err.message));
                        }
                      }}
                      className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-blue-300 border border-slate-700 font-medium transition flex items-center gap-1.5"
                      title="Tải biểu mẫu Đề cương PDF tự động sinh chuẩn UTC"
                    >
                      <span>📄</span> Tải PDF Đề Cương
                    </button>

                    <button
                      onClick={() => {
                        setSelectedProject({
                          id: r.project,
                          student_name: r.student_name,
                          student_reg_no: r.student_reg_no,
                          topic_title_vi: r.topic_title,
                          template_data: r.template_data || {},
                        });
                        setOutlineComments(r.comments || r.template_data?.supervisor_notes || '');
                        setVerdict(r.verdict && r.verdict !== 'PENDING' ? r.verdict : 'APPROVED');
                        setShowOutlineModal(true);
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5 shadow-md shadow-blue-600/20"
                    >
                      <span>✏️</span> Thẩm Định Đề Cương
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Weekly Reports */}
      {activeTab === 'weekly' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-bold text-base text-slate-100">Đánh giá Báo cáo tiến độ tuần - Giai đoạn 4 ({stage4Projects.length} SV)</h3>
            <span className="text-xs px-3 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold">
              Hiện có {stageCounts[4] || 0} sinh viên ở giai đoạn này
            </span>
          </div>
          {stage4Projects.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">Chưa có sinh viên nào ở Giai đoạn 4.</div>
          ) : (
          <div className="space-y-4">
            {stage4Projects.map((p) => (
              <div key={p.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <div>
                    <span className="font-bold text-sm text-slate-100">{p.student_name}</span>
                    <span className="text-xs text-slate-400 ml-2">({p.student_reg_no})</span>
                  </div>
                  <span className="text-xs text-slate-400">Đã nộp: {p.weekly_reports?.length || 0} / 15 tuần</span>
                </div>

                {p.weekly_reports?.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">Sinh viên chưa nộp báo cáo tuần nào.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {p.weekly_reports?.map((r: any) => (
                      <div key={r.id} className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-blue-400">Tuần {r.week_number}</span>
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
                            {r.supervisor_rating_display || r.supervisor_rating}
                          </span>
                        </div>
                        <p className="text-slate-300 line-clamp-2">{r.summary_content}</p>
                        {r.supervisor_feedback && (
                          <p className="text-emerald-400 italic">Nhận xét: {r.supervisor_feedback}</p>
                        )}
                        <button
                          onClick={() => {
                            setSelectedReport(r);
                            setWeeklyFeedback(r.supervisor_feedback || '');
                            setShowWeeklyModal(true);
                          }}
                          className="mt-1 text-xs text-blue-400 hover:underline"
                        >
                          ✏️ Đánh giá / Sửa nhận xét
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
          )}
        </div>
      )}

      {/* Tab 5: Supervision Tasks & Meeting Logs */}
      {activeTab === 'supervision' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <span>📋</span>
                <span>Giai Đoạn 5: Quản Lý Nhiệm Vụ (Task Board) & Nhật Ký Hướng Dẫn</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Theo dõi tiến độ hoàn thành nhiệm vụ, sản phẩm sinh viên nộp và biên bản họp hướng dẫn định kỳ.
              </p>
            </div>
            <span className="text-xs px-3 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold">
              Hiện có {stageCounts[5] || 0} sinh viên ở giai đoạn này
            </span>
          </div>

          {stage5Projects.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">Chưa có sinh viên nào ở Giai đoạn 5.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {stage5Projects.map((p) => {
                const totalTasks = p.tasks?.length || 0;
                const completedTasks = p.tasks?.filter((t: any) => t.is_completed).length || 0;
                const percent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
                const meetingsCount = p.meeting_logs?.length || 0;
                const pendingDeliverables = p.tasks?.filter((t: any) => (t.deliverable_file || t.deliverable_url) && (!t.review_verdict || t.review_verdict === 'NOT_SUBMITTED' || t.review_verdict === 'PENDING')).length || 0;

                return (
                  <div key={p.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 hover:border-slate-700 transition">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-blue-400">{p.student_reg_no}</span>
                          <span className="font-bold text-sm text-slate-100">{p.student_name}</span>
                        </div>
                        <p className="text-xs text-slate-300 mt-1 line-clamp-1"><b>Đề tài:</b> {p.topic_title_vi}</p>
                      </div>
                      <span className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 whitespace-nowrap">
                        {p.student_class}
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Tiến độ nhiệm vụ: <b>{completedTasks}/{totalTasks}</b> đã xong</span>
                        <span className="font-bold text-blue-400">{percent}%</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-emerald-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>

                    {/* Condition Status & Defense Eligibility */}
                    <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-400 font-medium">Xét ĐK bảo vệ:</span>
                        {p.is_eligible_for_defense ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <span>✓</span> ĐỦ ĐIỀU KIỆN BẢO VỆ
                          </span>
                        ) : p.supervisor_score !== null && p.supervisor_score !== undefined ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            Điểm GVHD: {p.supervisor_score}đ (Chưa duyệt ĐK)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                            ⏳ Chưa xét điều kiện
                          </span>
                        )}
                      </div>

                      {p.supervisor_score !== null && p.supervisor_score !== undefined && (
                        <span className="text-xs font-bold text-emerald-400">
                          Điểm GVHD: {p.supervisor_score}/10đ
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-900 text-xs text-slate-400">
                      <div className="flex items-center gap-3">
                        <span>🗓️ <b>{meetingsCount}</b> buổi họp</span>
                        {pendingDeliverables > 0 && (
                          <span className="text-amber-400 font-bold animate-pulse">
                            📦 {pendingDeliverables} sản phẩm chờ duyệt
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProject(p);
                            setEvalScore(p.supervisor_score !== null && p.supervisor_score !== undefined ? p.supervisor_score.toString() : '');
                            setEvalFeedback(p.supervisor_feedback || '');
                            setIsEligible(p.is_eligible_for_defense ?? true);
                            setShowEvalModal(true);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition flex items-center gap-1.5 shadow-emerald-600/30"
                          title="Xét điều kiện sinh viên bảo vệ và chấm điểm hướng dẫn (40%)"
                        >
                          <span>⭐</span>
                          <span>{p.is_eligible_for_defense ? 'Sửa ĐK & Điểm GVHD' : 'Xét Điều Kiện & Chấm Điểm'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenSupervision(p)}
                          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow transition flex items-center gap-1.5"
                        >
                          <span>📋</span>
                          <span>Nhiệm vụ & Nhật ký ➔</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 6: Final Supervisor Evaluation & Defense Eligibility */}
      {activeTab === 'eval' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <span>🏆</span>
                <span>Giai Đoạn 6: Xét Điều Kiện Bảo Vệ & Đánh Giá Điểm GVHD (40%)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Theo Quy chế UTC: Giảng viên hướng dẫn trực tiếp xét điều kiện cho sinh viên được ra bảo vệ và chấm điểm hướng dẫn (40% điểm tổng kết).
              </p>
            </div>

            {/* Filter buttons */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setEvalFilter('ALL')}
                className={`px-3 py-1 rounded-md font-semibold transition ${
                  evalFilter === 'ALL' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tất cả ({projects.length})
              </button>
              <button
                type="button"
                onClick={() => setEvalFilter('PENDING')}
                className={`px-3 py-1 rounded-md font-semibold transition ${
                  evalFilter === 'PENDING' ? 'bg-amber-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Chờ xét ĐK ({countEvalPending})
              </button>
              <button
                type="button"
                onClick={() => setEvalFilter('ELIGIBLE')}
                className={`px-3 py-1 rounded-md font-semibold transition ${
                  evalFilter === 'ELIGIBLE' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Đã đủ điều kiện ({countEvalEligible})
              </button>
            </div>
          </div>

          {evaluatableProjects.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              Không có sinh viên nào phù hợp với bộ lọc đã chọn.
            </div>
          ) : (
            <div className="space-y-3">
              {evaluatableProjects.map((p) => {
                const totalTasks = p.tasks?.length || 0;
                const completedTasks = p.tasks?.filter((t: any) => t.is_completed).length || 0;
                const percent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
                const meetingsCount = p.meeting_logs?.length || 0;

                return (
                  <div
                    key={p.id}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-blue-400">{p.student_reg_no}</span>
                        <span className="font-bold text-sm text-slate-100">{p.student_name}</span>
                        <span className="text-xs text-slate-400">({p.student_class})</span>

                        {p.is_eligible_for_defense ? (
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold flex items-center gap-1">
                            <span>✓</span> ĐỦ ĐIỀU KIỆN BẢO VỆ
                          </span>
                        ) : p.supervisor_score !== null && p.supervisor_score !== undefined ? (
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold">
                            Chưa xác nhận bảo vệ
                          </span>
                        ) : (
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-medium">
                            Chưa xét điều kiện
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-300 truncate">
                        <b>Đề tài:</b> {p.topic_title_vi}
                      </p>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-0.5">
                        <span>Tiến độ task: <b className="text-blue-400">{completedTasks}/{totalTasks}</b> ({percent}%)</span>
                        <span>Nhật ký: <b className="text-slate-300">{meetingsCount}</b> buổi</span>
                        <span className="text-emerald-400 font-semibold">
                          Điểm GVHD: {p.supervisor_score !== null && p.supervisor_score !== undefined ? `${p.supervisor_score} / 10đ` : 'Chưa chấm'}
                        </span>
                        {p.supervisor_score !== null && (
                          p.supervisor_score_is_draft ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              BẢN NHÁP
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              CHÍNH THỨC
                            </span>
                          )
                        )}
                      </div>

                      {p.supervisor_feedback && (
                        <p className="text-xs text-slate-400 italic bg-slate-900/60 p-2 rounded border border-slate-800/80">
                          Nhận xét: "{p.supervisor_feedback}"
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                      <button
                        type="button"
                        onClick={() => handleOpenSupervision(p)}
                        className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
                      >
                        Xem nhiệm vụ
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProject(p);
                          setEvalScore(p.supervisor_score !== null && p.supervisor_score !== undefined ? p.supervisor_score.toString() : '');
                          setEvalFeedback(p.supervisor_feedback || '');
                          setIsEligible(p.is_eligible_for_defense ?? true);
                          setShowEvalModal(true);
                        }}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-md shadow-emerald-600/30 flex items-center gap-1.5"
                      >
                        <span>⭐</span>
                        <span>{p.is_eligible_for_defense ? 'Sửa ĐK & Điểm GVHD' : 'Xét Điều Kiện & Chấm Điểm'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Reviewer Evaluation */}
      {activeTab === 'reviewer' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <h3 className="font-bold text-base text-slate-100">Đồ án được phân công Phản biện độc lập (20%)</h3>
          {reviewerProjects.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">Chưa có đồ án nào được phân công cho Thầy/Cô phản biện.</div>
          ) : (
            <div className="space-y-3">
              {reviewerProjects.map((p) => (
                <div key={p.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-100">{p.student_name}</span>
                      <span className="text-xs text-slate-400">({p.student_reg_no})</span>
                      <span className="text-xs text-slate-400">GVHD: {p.supervisor?.full_name}</span>
                    </div>
                    <p className="text-xs text-slate-300"><b>Đề tài:</b> {p.topic_title_vi}</p>
                    <div className="flex items-center gap-3 pt-0.5">
                      <span className="text-xs text-indigo-400 font-semibold">
                        Điểm GVPB: {p.reviewer_score !== null ? `${p.reviewer_score} / 10đ` : 'Chưa chấm phản biện'}
                      </span>
                      {p.reviewer_verdict && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            p.reviewer_verdict === 'APPROVED'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : p.reviewer_verdict === 'CONDITIONAL'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          }`}
                        >
                          {p.reviewer_verdict_display ||
                            (p.reviewer_verdict === 'APPROVED'
                              ? 'Cho phép bảo vệ'
                              : p.reviewer_verdict === 'CONDITIONAL'
                              ? 'Bảo vệ có điều kiện'
                              : 'Không cho phép bảo vệ')}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setSelectedProject(p);
                      setRevScore(p.reviewer_score !== null ? p.reviewer_score.toString() : '');
                      setRevFeedback(p.reviewer_feedback || '');
                      setRevVerdict(p.reviewer_verdict || 'APPROVED');
                      setShowReviewerModal(true);
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition shadow-md shadow-indigo-600/30"
                  >
                    {p.reviewer_score !== null ? 'Sửa điểm Phản biện' : 'Chấm Phản biện'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal Outline Review (Enhanced with Template Inspection) */}
      {showOutlineModal && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto"
          onClick={outlineGuard.handleOverlayClick}
        >
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl max-w-2xl w-full shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <span>📄</span> Thẩm Định Đề Tài & Đề Cương Chi Tiết (GĐ 2)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sinh viên: <b className="text-slate-200">{selectedProject?.student_name}</b> ({selectedProject?.student_reg_no || 'UTC'})
                </p>
              </div>
              <button
                type="button"
                onClick={outlineGuard.requestClose}
                className="text-slate-400 hover:text-slate-200 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Template Outline Details Display */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 max-h-72 overflow-y-auto text-xs">
              <div>
                <span className="text-[11px] font-bold text-slate-400 block">Tên đề tài tiếng Việt:</span>
                <p className="text-slate-100 font-semibold mt-0.5">{selectedProject?.topic_title_vi || 'Chưa cập nhật'}</p>
              </div>

              {selectedProject?.template_data?.topic_objective && (
                <div>
                  <span className="text-[11px] font-bold text-blue-400 block">Mục tiêu cốt lõi của đề tài:</span>
                  <p className="text-slate-300 mt-0.5 whitespace-pre-line">{selectedProject.template_data.topic_objective}</p>
                </div>
              )}

              <div className="pt-2 border-t border-slate-800/80 space-y-2">
                <span className="font-bold text-slate-300 block text-xs">Nội dung Template đề cương sinh viên đã điền:</span>
                
                <div>
                  <span className="text-[11px] text-emerald-400 font-semibold block">🎯 Mục tiêu nghiên cứu (Objectives):</span>
                  <p className="text-slate-300 mt-0.5 whitespace-pre-line bg-slate-900/80 p-2.5 rounded border border-slate-800">
                    {selectedProject?.template_data?.objectives || 'Chưa điền mục tiêu'}
                  </p>
                </div>

                <div>
                  <span className="text-[11px] text-teal-400 font-semibold block">📐 Phạm vi nghiên cứu (Scope):</span>
                  <p className="text-slate-300 mt-0.5 whitespace-pre-line bg-slate-900/80 p-2.5 rounded border border-slate-800">
                    {selectedProject?.template_data?.scope || 'Chưa điền phạm vi'}
                  </p>
                </div>

                <div>
                  <span className="text-[11px] text-amber-400 font-semibold block">📅 Kế hoạch thực hiện theo tuần (Work Plan):</span>
                  <p className="text-slate-300 mt-0.5 whitespace-pre-line bg-slate-900/80 p-2.5 rounded border border-slate-800">
                    {selectedProject?.template_data?.work_plan || 'Chưa điền kế hoạch'}
                  </p>
                </div>

                <div>
                  <span className="text-[11px] text-purple-400 font-semibold block">📦 Sản phẩm bàn giao dự kiến (Deliverables):</span>
                  <p className="text-slate-300 mt-0.5 whitespace-pre-line bg-slate-900/80 p-2.5 rounded border border-slate-800">
                    {selectedProject?.template_data?.deliverables || 'Chưa điền sản phẩm bàn giao'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={async () => {
                  try {
                    const blob = await apiService.exportOutlinePdf(selectedProject.id);
                    const url = window.URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `De_cuong_${selectedProject.student_reg_no || 'UTC'}.pdf`;
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                    window.URL.revokeObjectURL(url);
                  } catch (err: any) {
                    alert('Lỗi tải PDF đề cương: ' + (err.response?.data?.detail || err.message));
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-blue-300 border border-slate-700 font-medium transition flex items-center gap-1.5"
              >
                <span>📄</span> Xem / Tải Đề Cương PDF Đầy Đủ
              </button>
            </div>

            <form onSubmit={handleReviewOutline} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Kết luận thẩm định của GVHD (*)</label>
                <select
                  value={verdict}
                  onChange={(e) => setVerdict(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500 font-bold"
                >
                  <option value="APPROVED">✅ ĐẠT YÊU CẦU (Phê duyệt thực hiện đồ án)</option>
                  <option value="REVISION_REQUIRED">⚠️ YÊU CẦU CHỈNH SỬA LẠI ĐỀ CƯƠNG</option>
                  <option value="REJECTED">❌ KHÔNG ĐẠT / HỦY ĐỀ TÀI</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Ý kiến & Nhận xét của Giảng viên</label>
                <textarea
                  rows={3}
                  value={outlineComments}
                  onChange={(e) => setOutlineComments(e.target.value)}
                  placeholder="Ghi chú chi tiết cho sinh viên chỉnh sửa hoặc lời dặn dò khi phê duyệt..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={outlineGuard.requestClose}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700 transition"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition shadow-md shadow-blue-600/30"
                >
                  Lưu Kết Quả Xét Duyệt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Weekly Feedback */}
      {showWeeklyModal && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={weeklyGuard.handleOverlayClick}
        >
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold text-slate-100 mb-4">Đánh giá Báo cáo Tuần {selectedReport?.week_number}</h3>
            <form onSubmit={handleFeedbackWeekly} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Xếp loại tuần</label>
                <select
                  value={weeklyRating}
                  onChange={(e) => setWeeklyRating(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                >
                  <option value="GOOD">Tốt / Đạt tiến độ</option>
                  <option value="ACCEPTABLE">Chấp nhận được</option>
                  <option value="LATE">Chậm tiến độ</option>
                  <option value="UNSATISFACTORY">Không đạt yêu cầu</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Nhận xét của GVHD</label>
                <textarea
                  rows={3}
                  value={weeklyFeedback}
                  onChange={(e) => setWeeklyFeedback(e.target.value)}
                  placeholder="Ghi chú góp ý cho sinh viên..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={weeklyGuard.requestClose}
                  className="px-4 py-2 rounded bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500"
                >
                  Lưu nhận xét
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Supervisor Eval */}
      {showEvalModal && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={evalGuard.handleOverlayClick}
        >
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold text-slate-100 mb-1">Phiếu Đánh Giá Sơ Khảo & Xét Điều Kiện Bảo Vệ ĐATN</h3>
            <p className="text-xs text-slate-400 mb-3">{selectedProject?.student_name} ({selectedProject?.student_reg_no}) - {selectedProject?.topic_title_vi}</p>
            
            <div className="p-2.5 rounded-lg bg-blue-950/30 border border-blue-500/20 text-[11px] text-blue-200 mb-3">
              💡 <b>Quy chế UTC:</b> Giảng viên hướng dẫn trực tiếp đánh giá quá trình và quyết định sinh viên có đủ điều kiện bảo vệ hay không. Điểm GVHD chiếm <b>40%</b> điểm tổng kết.
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleSupervisorEvaluation(false); }} className="space-y-3">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <label className="block text-xs font-bold text-slate-200">
                  ⚖️ Quyết định Xét Điều Kiện Bảo Vệ ĐATN:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEligible(true)}
                    className={`p-2.5 rounded-lg border text-xs font-bold transition flex flex-col items-center gap-1 ${
                      isEligible
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-500/20'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-base">✅</span>
                    <span>ĐỦ ĐIỀU KIỆN BẢO VỆ</span>
                    <span className="text-[10px] font-normal opacity-80">Cho phép bảo vệ trước HĐ</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsEligible(false)}
                    className={`p-2.5 rounded-lg border text-xs font-bold transition flex flex-col items-center gap-1 ${
                      !isEligible
                        ? 'bg-rose-500/20 border-rose-500 text-rose-300 shadow-md shadow-rose-500/20'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span className="text-base">❌</span>
                    <span>CHƯA ĐỦ ĐIỀU KIỆN</span>
                    <span className="text-[10px] font-normal opacity-80">Bảo lưu / Hoãn sang đợt sau</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Điểm hướng dẫn (Thang 10, hệ số 40%, tối đa 10.0đ)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  required
                  placeholder="VD: 8.5"
                  value={evalScore}
                  onChange={(e) => setEvalScore(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Nhận xét chi tiết về thái độ & kết quả ĐATN</label>
                <textarea
                  rows={3}
                  value={evalFeedback}
                  onChange={(e) => setEvalFeedback(e.target.value)}
                  placeholder="Sinh viên hoàn thành đầy đủ khối lượng công việc, ứng dụng demo chạy tốt..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={evalGuard.requestClose}
                  className="px-4 py-2 rounded bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={() => handleSupervisorEvaluation(true)}
                  className="px-3 py-2 rounded bg-amber-600/90 hover:bg-amber-600 text-white text-xs font-semibold"
                >
                  💾 Lưu nháp (Draft)
                </button>
                <button
                  type="button"
                  onClick={() => handleSupervisorEvaluation(false)}
                  className="px-3 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                >
                  ✓ Lưu chính thức
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Reviewer Eval */}
      {showReviewerModal && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={reviewerGuard.handleOverlayClick}
        >
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl max-w-md w-full shadow-2xl">
            <h3 className="text-base font-bold text-slate-100 mb-2">Phiếu Chấm Giảng viên Phản biện (20%)</h3>
            <p className="text-xs text-slate-400 mb-4">{selectedProject?.student_name} - {selectedProject?.topic_title_vi}</p>
            <form onSubmit={handleReviewerEvaluation} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Điểm phản biện (Thang 10, tối đa 10.0đ)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  required
                  placeholder="VD: 8.0"
                  value={revScore}
                  onChange={(e) => setRevScore(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Kết luận phản biện <span className="text-rose-400">*</span>
                </label>
                <select
                  value={revVerdict}
                  onChange={(e) => setRevVerdict(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                >
                  <option value="APPROVED">Cho phép bảo vệ</option>
                  <option value="CONDITIONAL">Bảo vệ có điều kiện</option>
                  <option value="REJECTED">Không cho phép bảo vệ</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Nhận xét & Câu hỏi phản biện</label>
                <textarea
                  rows={3}
                  value={revFeedback}
                  onChange={(e) => setRevFeedback(e.target.value)}
                  placeholder="Đề tài có tính ứng dụng cao, câu hỏi phản biện: Phương pháp bảo mật xác thực được thực hiện ra sao?..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={reviewerGuard.requestClose}
                  className="px-4 py-2 rounded bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500"
                >
                  Lưu điểm & Kết luận
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Quản lý Nhật ký & Giao việc cho SV */}
      {showSupervisionModal && (
        <div
          className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50"
          onClick={supervisionGuard.handleOverlayClick}
        >
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-blue-400">
                    {supervisionProject?.student_reg_no}
                  </span>
                  <span className="text-base font-bold text-slate-100">
                    {supervisionProject?.student_name}
                  </span>
                  <span className="text-xs text-slate-400">({supervisionProject?.student_class})</span>
                </div>
                <h4 className="text-xs font-medium text-slate-300 mt-1">
                  <b>Đề tài:</b> {supervisionProject?.topic_title_vi}
                </h4>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProject(supervisionProject);
                    setEvalScore(supervisionProject?.supervisor_score !== null && supervisionProject?.supervisor_score !== undefined ? supervisionProject.supervisor_score.toString() : '');
                    setEvalFeedback(supervisionProject?.supervisor_feedback || '');
                    setIsEligible(supervisionProject?.is_eligible_for_defense ?? true);
                    setShowEvalModal(true);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-600/30"
                  title="Xét điều kiện bảo vệ và chấm điểm hướng dẫn"
                >
                  <span>⭐</span>
                  <span>{supervisionProject?.is_eligible_for_defense ? 'Sửa ĐK & Điểm GVHD' : 'Xét ĐK & Chấm Điểm'}</span>
                </button>

                <button
                  onClick={supervisionGuard.requestClose}
                  className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-sm"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Sub Tabs */}
            <div className="flex gap-2 border-b border-slate-800 pb-2">
              <button
                onClick={() => setSupervisionSubTab('tasks')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                  supervisionSubTab === 'tasks'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <span>📌</span>
                <span>Nhiệm vụ & Giao việc ({supervisionTasks.length})</span>
              </button>
              <button
                onClick={() => setSupervisionSubTab('logs')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 ${
                  supervisionSubTab === 'logs'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <span>🗓️</span>
                <span>Nhật ký họp định kỳ ({supervisionLogs.length})</span>
              </button>
            </div>

            {/* Content: Tasks Sub-Tab */}
            {supervisionSubTab === 'tasks' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-sm font-bold text-slate-200">Danh sách công việc giao cho sinh viên</h5>
                    <p className="text-xs text-slate-400">
                      Sinh viên sẽ nhận được thông báo và theo dõi hạn nộp trên Task Board cá nhân.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAddTaskForm(!showAddTaskForm)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow transition flex items-center gap-1.5"
                  >
                    <span>{showAddTaskForm ? '✕ Đóng form' : '+ Giao việc mới'}</span>
                  </button>
                </div>

                {/* Add Task Form */}
                {showAddTaskForm && (
                  <form onSubmit={handleCreateTask} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <h6 className="text-xs font-bold text-blue-400 uppercase">Thêm nhiệm vụ mới</h6>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Tên nhiệm vụ / công việc *</label>
                      <input
                        type="text"
                        required
                        placeholder="Ví dụ: Hoàn thành thiết kế giao diện Figma cho phân hệ sinh viên"
                        value={taskTitle}
                        onChange={(e) => setTaskTitle(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">Mức độ ưu tiên</label>
                        <select
                          value={taskPriority}
                          onChange={(e) => setTaskPriority(e.target.value as any)}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                        >
                          <option value="LOW">Thấp</option>
                          <option value="MEDIUM">Trung bình</option>
                          <option value="HIGH">Cao</option>
                          <option value="URGENT">Khẩn cấp</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">Hạn nộp (Deadline)</label>
                        <input
                          type="date"
                          value={taskDueDate}
                          onChange={(e) => setTaskDueDate(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                        >
                        </input>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Mô tả chi tiết / Hướng dẫn</label>
                      <textarea
                        rows={2}
                        placeholder="Ghi chú cụ thể các tiêu chuẩn, link tài liệu tham khảo..."
                        value={taskDesc}
                        onChange={(e) => setTaskDesc(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowAddTaskForm(false)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        disabled={savingTask}
                        className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow disabled:opacity-50"
                      >
                        {savingTask ? 'Đang lưu...' : 'Giao việc ngay'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Tasks List */}
                {loadingSupervision ? (
                  <div className="py-8 text-center text-slate-400 text-xs">Đang tải danh sách nhiệm vụ...</div>
                ) : supervisionTasks.length === 0 ? (
                  <div className="p-6 text-center bg-slate-950 rounded-xl border border-slate-800 text-slate-400 text-xs">
                    Chưa có nhiệm vụ nào được giao cho sinh viên này. Bấm nút <b>"+ Giao việc mới"</b> ở trên để giao bài.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {supervisionTasks.map((t) => (
                      <div
                        key={t.id}
                        className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-start justify-between gap-3 hover:border-slate-700 transition"
                      >
                        <div className="space-y-1 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`text-xs font-semibold ${t.is_completed ? 'line-through text-slate-400' : 'text-slate-100'}`}>
                              {t.title}
                            </span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                              t.priority === 'URGENT' ? 'bg-rose-500/10 text-rose-400' :
                              t.priority === 'HIGH' ? 'bg-amber-500/10 text-amber-400' :
                              'bg-blue-500/10 text-blue-400'
                            }`}>
                              {t.priority_display || t.priority}
                            </span>
                            {t.is_completed ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                                ✅ Đã hoàn thành
                              </span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                                ⏳ Chưa xong
                              </span>
                            )}

                            {/* Phase 5 Verdict Badge */}
                            {t.review_verdict && t.review_verdict !== 'NOT_SUBMITTED' && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                t.review_verdict === 'ACCEPTED' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                                t.review_verdict === 'REVISION_REQUIRED' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' :
                                'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              }`}>
                                {t.review_verdict === 'ACCEPTED' ? '🎯 Đạt' :
                                 t.review_verdict === 'REVISION_REQUIRED' ? '⚠️ Cần sửa' :
                                 '⏳ Chờ đánh giá'}
                              </span>
                            )}
                          </div>
                          {t.description && <p className="text-xs text-slate-400">{t.description}</p>}
                          <div className="text-[11px] text-slate-400 flex items-center gap-3 pt-0.5">
                            {t.due_date && <span>Hạn: <b>{t.due_date}</b></span>}
                            {t.completed_at && (
                              <span className="text-emerald-400">
                                Hoàn thành lúc: {new Date(t.completed_at).toLocaleDateString('vi-VN')}
                              </span>
                            )}
                          </div>

                          {/* Phase 5: Student Deliverable */}
                          {(t.deliverable_file || t.deliverable_url) && (
                            <div className="mt-1.5 p-2 rounded bg-slate-900 border border-slate-800 text-[11px] space-y-1">
                              <span className="font-semibold text-emerald-400">📦 Sản phẩm SV nộp:</span>
                              <div className="flex flex-wrap items-center gap-3">
                                {t.deliverable_file && (
                                  <a href={t.deliverable_file} target="_blank" rel="noreferrer" className="text-blue-400 underline font-medium hover:text-blue-300">
                                    File đính kèm ↗
                                  </a>
                                )}
                                {t.deliverable_url && (
                                  <a href={t.deliverable_url} target="_blank" rel="noreferrer" className="text-blue-400 underline font-medium hover:text-blue-300">
                                    Link sản phẩm (Git/Drive) ↗
                                  </a>
                                )}
                              </div>
                            </div>
                          )}

                          {t.student_notes && (
                            <div className="mt-1 p-2 rounded bg-blue-950/20 border border-blue-500/20 text-[11px] text-blue-200">
                              <span className="font-semibold text-blue-400">📝 Ghi chú từ SV:</span> {t.student_notes}
                            </div>
                          )}

                          {t.supervisor_review_notes && (
                            <div className={`mt-1 p-2 rounded text-[11px] border ${
                              t.review_verdict === 'REVISION_REQUIRED'
                                ? 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                                : 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                            }`}>
                              <span className="font-semibold">
                                {t.review_verdict === 'REVISION_REQUIRED' ? '⚠️ Yêu cầu sửa của GV:' : '💬 Nhận xét của GV:'}
                              </span>{' '}
                              {t.supervisor_review_notes}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1.5">
                          <button
                            onClick={() => handleOpenTaskReview(t)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition flex items-center gap-1"
                            title="Đánh giá sản phẩm nhiệm vụ của SV"
                          >
                            <span>⚖️</span>
                            <span>Đánh giá</span>
                          </button>
                          <button
                            onClick={() => handleDeleteTask(t.id)}
                            className="px-2 py-0.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[11px] transition"
                            title="Xóa nhiệm vụ"
                          >
                            Xóa
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Content: Meeting Logs Sub-Tab */}
            {supervisionSubTab === 'logs' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h5 className="text-sm font-bold text-slate-200">Biên bản / Nhật ký các buổi làm việc</h5>
                    <p className="text-xs text-slate-400">
                      Ghi nhận định kỳ nội dung trao đổi, tiến độ và nhận xét của GVHD.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAddLogForm(!showAddLogForm)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow transition flex items-center gap-1.5"
                  >
                    <span>{showAddLogForm ? '✕ Đóng form' : '+ Thêm nhật ký'}</span>
                  </button>
                </div>

                {/* Add Meeting Log Form */}
                {showAddLogForm && (
                  <form onSubmit={handleCreateMeetingLog} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <h6 className="text-xs font-bold text-emerald-400 uppercase">Ghi nhận buổi làm việc mới</h6>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">Ngày làm việc *</label>
                        <input
                          type="date"
                          required
                          value={meetingDate}
                          onChange={(e) => setMeetingDate(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">Thời gian</label>
                        <input
                          type="text"
                          value={meetingTime}
                          onChange={(e) => setMeetingTime(e.target.value)}
                          placeholder="VD: 09:00 - 10:30"
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">Hình thức</label>
                        <select
                          value={meetingType}
                          onChange={(e) => setMeetingType(e.target.value as any)}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                        >
                          <option value="OFFLINE">Gặp trực tiếp</option>
                          <option value="ONLINE">Trực tuyến (Meet/Zoom)</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        {meetingType === 'ONLINE' ? 'Link phòng họp trực tuyến (Google Meet / Zoom) *' : 'Địa điểm họp trực tiếp'}
                      </label>
                      <input
                        type="text"
                        required={meetingType === 'ONLINE'}
                        placeholder={meetingType === 'ONLINE' ? 'VD: https://meet.google.com/abc-defg-hij hoặc https://zoom.us/j/...' : 'VD: Văn phòng bộ môn P405 hoặc phòng LAB...'}
                        value={locationOrLink}
                        onChange={(e) => setLocationOrLink(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Nội dung đã trao đổi / Tiến độ *</label>
                      <textarea
                        rows={3}
                        required
                        placeholder="Tóm tắt nội dung sinh viên báo cáo, vấn đề thảo luận..."
                        value={contentDiscussed}
                        onChange={(e) => setContentDiscussed(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Góp ý & Nhận xét của GVHD</label>
                      <textarea
                        rows={2}
                        placeholder="Đánh giá kết quả tuần qua, yêu cầu cần bổ sung chỉnh sửa..."
                        value={supervisorNotes}
                        onChange={(e) => setSupervisorNotes(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    {/* Feature 5: Giao việc tuần tới làm căn cứ đánh giá điểm quá trình */}
                    <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-amber-400">
                          <input
                            type="checkbox"
                            checked={logAssignTask}
                            onChange={(e) => setLogAssignTask(e.target.checked)}
                            className="rounded border-slate-700 text-blue-600 focus:ring-0"
                          />
                          <span>📌 Giao nhiệm vụ cho tuần tới (Lưu làm căn cứ chấm điểm quá trình)</span>
                        </label>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                          ⭐ Căn cứ điểm quá trình
                        </span>
                      </div>

                      {logAssignTask && (
                        <div className="space-y-2.5 pt-1 border-t border-slate-800">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-300 mb-1">Tên công việc / nhiệm vụ *</label>
                            <input
                              type="text"
                              required={logAssignTask}
                              placeholder="VD: Thiết kế cơ sở dữ liệu và dựng API phân hệ xác thực"
                              value={logTaskTitle}
                              onChange={(e) => setLogTaskTitle(e.target.value)}
                              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                            />
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                            <div>
                              <label className="block text-[11px] font-medium text-slate-300 mb-1">Mức độ ưu tiên</label>
                              <select
                                value={logTaskPriority}
                                onChange={(e) => setLogTaskPriority(e.target.value as any)}
                                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                              >
                                <option value="LOW">Thấp</option>
                                <option value="MEDIUM">Trung bình</option>
                                <option value="HIGH">Cao</option>
                                <option value="URGENT">Khẩn cấp</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium text-slate-300 mb-1">Hạn nộp (Deadline)</label>
                              <input
                                type="date"
                                value={logTaskDueDate}
                                onChange={(e) => setLogTaskDueDate(e.target.value)}
                                className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-slate-300 mb-1">Chi tiết yêu cầu & Hướng dẫn</label>
                            <textarea
                              rows={2}
                              placeholder="Ghi chú chi tiết kết quả cần đạt, tài liệu đính kèm..."
                              value={logTaskDesc}
                              onChange={(e) => setLogTaskDesc(e.target.value)}
                              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">Kế hoạch kỳ họp tiếp theo</label>
                      <input
                        type="text"
                        placeholder="VD: Báo cáo kết quả kiểm thử và hoàn thiện báo cáo bản nháp"
                        value={nextMeetingPlan}
                        onChange={(e) => setNextMeetingPlan(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowAddLogForm(false)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        disabled={savingLog}
                        className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow disabled:opacity-50"
                      >
                        {savingLog ? 'Đang lưu...' : 'Lưu nhật ký & Căn cứ đánh giá'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Logs List */}
                {loadingSupervision ? (
                  <div className="py-8 text-center text-slate-400 text-xs">Đang tải nhật ký...</div>
                ) : supervisionLogs.length === 0 ? (
                  <div className="p-6 text-center bg-slate-950 rounded-xl border border-slate-800 text-slate-400 text-xs">
                    Chưa có nhật ký buổi họp nào được lưu. Bấm <b>"+ Thêm nhật ký"</b> để tạo buổi đầu tiên.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {supervisionLogs.map((log, idx) => (
                      <div key={log.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
                        <div className="flex flex-wrap justify-between items-center gap-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-200">
                              #{supervisionLogs.length - idx} - Ngày {log.meeting_date} ({log.meeting_time})
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                              ⭐ Căn cứ điểm quá trình
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${
                              log.meeting_type === 'ONLINE'
                                ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            }`}>
                              {log.meeting_type_display || (log.meeting_type === 'ONLINE' ? 'Trực tuyến (Meet/Zoom)' : 'Gặp trực tiếp')}
                            </span>
                            {log.location_or_link && (log.meeting_type === 'ONLINE' || log.location_or_link.startsWith('http')) && (
                              <a
                                href={log.location_or_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/30 text-[10px] font-semibold transition"
                              >
                                <span>📹 Tham gia cuộc họp ↗</span>
                              </a>
                            )}
                          </div>
                        </div>

                        {log.location_or_link && !(log.meeting_type === 'ONLINE' || log.location_or_link.startsWith('http')) && (
                          <div className="text-[11px] text-slate-400">
                            📍 Địa điểm: <span className="text-slate-300">{log.location_or_link}</span>
                          </div>
                        )}

                        <div className="text-xs text-slate-300 bg-slate-900/50 p-2.5 rounded border border-slate-800/80">
                          <span className="font-semibold text-slate-400">Nội dung trao đổi:</span> {log.content_discussed}
                        </div>

                        {log.supervisor_notes && (
                          <div className="text-xs text-emerald-300 bg-emerald-950/20 p-2 rounded border border-emerald-500/20">
                            <span className="font-semibold">Nhận xét GVHD:</span> {log.supervisor_notes}
                          </div>
                        )}

                        {log.tasks && log.tasks.length > 0 && (
                          <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800 space-y-1.5 text-xs">
                            <span className="font-bold text-amber-400">📌 Nhiệm vụ giao tuần tới (Căn cứ đánh giá):</span>
                            {log.tasks.map((t: any) => (
                              <div key={t.id} className="flex items-center justify-between text-slate-300 pl-2">
                                <span>• <b>{t.title}</b> {t.due_date && <span className="text-slate-400">(Hạn: {t.due_date})</span>}</span>
                                <span className={`text-[10px] px-1.5 py-0.2 rounded uppercase ${
                                  t.priority === 'URGENT' ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-800 text-slate-300'
                                }`}>
                                  {t.priority_display || t.priority}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        {log.next_meeting_plan && (
                          <div className="text-[11px] text-slate-400">
                            <b>Kế hoạch kỳ tới:</b> {log.next_meeting_plan}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal GĐ 2: GVHD Thẩm định & Phê duyệt đề tài (yeucau.md) */}
      {showTopicConfirmModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-lg w-full shadow-2xl space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <span className="text-xs text-blue-400 font-semibold uppercase tracking-wider">Giai đoạn 2: GVHD Thẩm định & Duyệt đề tài</span>
              <h3 className="text-base font-bold text-slate-100 mt-1">
                {selectedTopicProject?.student_name} ({selectedTopicProject?.student_reg_no})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                GVHD kiểm tra tính khả thi và thẩm định trực tiếp tên, mục tiêu đề tài của sinh viên.
              </p>
            </div>

            <form onSubmit={handleConfirmTopic} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Kết luận thẩm định (*)</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTopicConfirmDecision('APPROVE')}
                    className={`p-2.5 rounded-lg border font-semibold flex items-center justify-center gap-1.5 transition ${
                      topicConfirmDecision === 'APPROVE'
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span>🎯</span> Duyệt đạt đề tài
                  </button>
                  <button
                    type="button"
                    onClick={() => setTopicConfirmDecision('REVISION')}
                    className={`p-2.5 rounded-lg border font-semibold flex items-center justify-center gap-1.5 transition ${
                      topicConfirmDecision === 'REVISION'
                        ? 'bg-amber-600/20 border-amber-500 text-amber-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <span>⚠️</span> Yêu cầu sửa / Chọn lại
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Tên đề tài tiếng Việt (*)</label>
                <textarea
                  rows={2}
                  required
                  value={topicConfirmVi}
                  onChange={(e) => setTopicConfirmVi(e.target.value)}
                  placeholder="Nhập tên đề tài tiếng Việt chính xác..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Tên đề tài tiếng Anh</label>
                <textarea
                  rows={2}
                  value={topicConfirmEn}
                  onChange={(e) => setTopicConfirmEn(e.target.value)}
                  placeholder="Nhập tên đề tài tiếng Anh (nếu có)..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              {topicConfirmDecision === 'REVISION' && (
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Góp ý / Yêu cầu chỉnh sửa (*) <span className="text-amber-400">(Sinh viên sẽ thấy lý do này)</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={topicConfirmNotes}
                    onChange={(e) => setTopicConfirmNotes(e.target.value)}
                    placeholder="Chỉ rõ mục tiêu chưa khả thi hoặc gợi ý hướng đề tài khác..."
                    className="w-full px-3 py-2 bg-slate-950 border border-amber-500/40 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-amber-400"
                  />
                </div>
              )}

              <div className="p-3 rounded-lg bg-blue-950/30 border border-blue-500/30 text-blue-300 text-[11px]">
                {topicConfirmDecision === 'APPROVE' ? (
                  <span>🎯 Sau khi duyệt đạt, sinh viên được chuyển sang bước <b>Hoàn thiện đề cương theo mẫu (Template)</b> và xuất file PDF để GV duyệt.</span>
                ) : (
                  <span>⚠️ Sinh viên sẽ nhận thông báo yêu cầu sửa đổi hoặc chọn đề tài khác trên Dashboard cá nhân.</span>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTopicConfirmModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={confirmingTopic}
                  className={`px-5 py-2 rounded-lg text-white text-xs font-semibold shadow-md disabled:opacity-50 ${
                    topicConfirmDecision === 'APPROVE'
                      ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                      : 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30'
                  }`}
                >
                  {confirmingTopic ? 'Đang lưu...' : topicConfirmDecision === 'APPROVE' ? '✓ Duyệt Đạt Đề Tài' : '⚠️ Gửi Yêu Cầu Sửa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Phase 5: GV Đánh giá kết quả nhiệm vụ của sinh viên */}
      {showTaskReviewModal && selectedTaskForReview && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-lg w-full shadow-2xl space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <span className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">Giai đoạn 5: Đánh giá nhiệm vụ</span>
              <h3 className="text-base font-bold text-slate-100 mt-1">{selectedTaskForReview.title}</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Xem sản phẩm sinh viên nộp và đưa ra kết luận Đạt hoặc Yêu cầu sửa đổi.
              </p>
            </div>

            {/* Deliverable details */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
              <h5 className="font-bold text-slate-300">Kết quả sinh viên đã nộp:</h5>
              {selectedTaskForReview.deliverable_file || selectedTaskForReview.deliverable_url ? (
                <div className="flex flex-wrap items-center gap-3">
                  {selectedTaskForReview.deliverable_file && (
                    <a
                      href={selectedTaskForReview.deliverable_file}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600/20 text-blue-300 border border-blue-500/30 font-semibold hover:bg-blue-600/30"
                    >
                      <span>📥</span> Tải file sản phẩm ↗
                    </a>
                  )}
                  {selectedTaskForReview.deliverable_url && (
                    <a
                      href={selectedTaskForReview.deliverable_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-600/20 text-purple-300 border border-purple-500/30 font-semibold hover:bg-purple-600/30"
                    >
                      <span>🔗</span> Link kho lưu trữ / Demo ↗
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-slate-500 italic">Sinh viên chưa đính kèm file hoặc link trực tuyến.</p>
              )}

              {selectedTaskForReview.student_notes && (
                <div className="pt-1 text-slate-300">
                  <span className="text-slate-400 font-semibold">Ghi chú từ sinh viên:</span> {selectedTaskForReview.student_notes}
                </div>
              )}
            </div>

            <form onSubmit={handleSubmitTaskReview} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Kết luận đánh giá (*)</label>
                <select
                  value={taskReviewVerdict}
                  onChange={(e) => setTaskReviewVerdict(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                >
                  <option value="ACCEPTED">🎯 ĐẠT YÊU CẦU (Hoàn thành nhiệm vụ)</option>
                  <option value="REVISION_REQUIRED">⚠️ CHƯA ĐẠT / YÊU CẦU SỬA LẠI</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Nhận xét & Hướng dẫn sửa đổi (nếu có):
                </label>
                <textarea
                  rows={3}
                  value={taskReviewNotes}
                  onChange={(e) => setTaskReviewNotes(e.target.value)}
                  placeholder="Ghi nhận xét đánh giá, chỉ ra điểm cần khắc phục hoặc sửa lại..."
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowTaskReviewModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={reviewingTask}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/30 disabled:opacity-50"
                >
                  {reviewingTask ? 'Đang lưu...' : 'Lưu kết quả đánh giá'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Tab 6: Deferrals Management for Khoa / Ban Chu Nhiem (FLOW_24) */}
      {activeTab === 'deferrals' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <span>📋</span> Quản lý Đơn Xin Bảo Lưu Đồ Án Tốt Nghiệp ({deferralRequests.length})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Khoa phê duyệt chuyển trạng thái sang <b>DEFERRED (Bảo lưu)</b> hoặc từ chối loại khỏi đợt (DISQUALIFIED).
              </p>
            </div>
            <button
              onClick={() => fetchData()}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
            >
              🔄 Tải lại danh sách
            </button>
          </div>

          {deferralRequests.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              Hiện tại không có đơn xin bảo lưu đồ án nào cần xử lý.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase font-semibold">
                  <tr>
                    <th className="p-3">MSSV</th>
                    <th className="p-3">Sinh viên</th>
                    <th className="p-3">Phân loại lý do</th>
                    <th className="p-3">Chi tiết lý do & Nguyện vọng</th>
                    <th className="p-3">Minh chứng</th>
                    <th className="p-3">Thời gian nộp</th>
                    <th className="p-3">Trạng thái</th>
                    <th className="p-3 text-right">Khoa duyệt bảo lưu</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-300">
                  {deferralRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-950/40">
                      <td className="p-3 font-mono font-semibold text-blue-400">
                        {req.student?.registration_no || req.student_registration_no || 'N/A'}
                      </td>
                      <td className="p-3 font-medium text-slate-100">
                        {req.student?.full_name || req.student_name || 'Sinh viên'}
                      </td>
                      <td className="p-3">
                        <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-semibold">
                          {req.reason_category_display || req.reason_category || 'Bảo lưu'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-300 max-w-xs whitespace-pre-line">
                        {req.reason || req.reason_details}
                      </td>
                      <td className="p-3">
                        {req.evidence_file ? (
                          <a
                            href={req.evidence_file}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-400 underline font-medium hover:text-blue-300 inline-flex items-center gap-1"
                          >
                            <span>📎</span> Xem file ↗
                          </a>
                        ) : (
                          <span className="text-slate-500 italic">Không có</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-400 whitespace-nowrap">
                        {req.submitted_at || req.created_at ? new Date(req.submitted_at || req.created_at).toLocaleString('vi-VN') : 'N/A'}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold border ${
                          req.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' :
                          req.status === 'REJECTED' ? 'bg-rose-500/20 text-rose-400 border-rose-500/40' :
                          'bg-amber-500/20 text-amber-400 border-amber-500/40'
                        }`}>
                          {req.status === 'APPROVED' ? 'Đã duyệt bảo lưu' :
                           req.status === 'REJECTED' ? 'Bị từ chối' : 'Chờ Khoa duyệt'}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleReviewDeferral(req.id, 'APPROVED')}
                            disabled={reviewingDeferral}
                            className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow shadow-emerald-600/30 flex items-center gap-1 disabled:opacity-50"
                            title="Khoa chấp thuận bảo lưu đồ án (Chuyển sang DEFERRED)"
                          >
                            <span>✓</span> Duyệt Bảo lưu
                          </button>
                          <button
                            onClick={() => handleReviewDeferral(req.id, 'REJECTED')}
                            disabled={reviewingDeferral}
                            className="px-2.5 py-1 rounded bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 border border-rose-500/40 font-bold text-xs transition flex items-center gap-1 disabled:opacity-50"
                            title="Không duyệt bảo lưu (Sinh viên bị loại khỏi đợt)"
                          >
                            <span>✕</span> Từ chối
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal FLOW_14: Khoa từ chối đề tài bắt buộc nhập lý do */}
      {adminTopicModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-lg w-full shadow-2xl space-y-4">
            <div className="border-b border-slate-800 pb-3">
              <span className="text-xs text-rose-400 font-semibold uppercase tracking-wider">Khoa từ chối / Yêu cầu sửa đề tài</span>
              <h3 className="text-base font-bold text-slate-100 mt-1">
                {adminTopicModal.student_name} ({adminTopicModal.student_reg_no})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Đề tài: <b>{adminTopicModal.topic_title_vi}</b>
              </p>
            </div>

            <form onSubmit={handleSubmitAdminTopicReject} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Lý do từ chối / Yêu cầu chỉnh sửa (*) <span className="text-rose-400 font-bold">(Bắt buộc)</span>
                </label>
                <textarea
                  rows={4}
                  required
                  value={adminTopicNotes}
                  onChange={(e) => setAdminTopicNotes(e.target.value)}
                  placeholder="Ghi rõ lý do Khoa từ chối hoặc các điểm cần chỉnh sửa lại để SV và GVHD hoàn thiện..."
                  className="w-full px-3 py-2 bg-slate-950 border border-rose-500/40 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-rose-400"
                />
              </div>

              <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-500/30 text-rose-300 text-[11px]">
                ⚠️ Chú ý: Hệ thống không cho phép để trống ô lý do khi từ chối đề tài.
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setAdminTopicModal(null)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs hover:bg-slate-700"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={adminTopicSubmitting}
                  className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md shadow-rose-600/30 disabled:opacity-50"
                >
                  {adminTopicSubmitting ? 'Đang gửi...' : 'Gửi yêu cầu sửa đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
