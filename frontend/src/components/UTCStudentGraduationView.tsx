import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { apiService } from '../services/api';
import type { ThesisDeferralRequest } from '../types';
import { GRADUATION_STAGES, getProjectStageNumber } from '../utils/graduationStages';
import './UTCStudentGraduationView.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/app';


const formatDateVN = (dateStr?: string | null) => {
  if (!dateStr) return 'Chưa công bố';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
};

const getRoleBadgeStyle = (role: string) => {
  switch (role) {
    case 'CHAIR':
      return {
        badge: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
        avatarBg: 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
      };
    case 'SECRETARY':
      return {
        badge: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',
        avatarBg: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',
      };
    case 'EXTERNAL_MEMBER':
      return {
        badge: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
        avatarBg: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
      };
    default:
      return {
        badge: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
        avatarBg: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
      };
  }
};


export interface UTCStudentGraduationViewProps {
  initialTab?: 'project' | 'survey' | 'outline' | 'weekly' | 'supervision' | 'grade';
  onSubtabChange?: (tab: 'project' | 'survey' | 'outline' | 'weekly' | 'supervision' | 'grade') => void;
}

export const UTCStudentGraduationView: React.FC<UTCStudentGraduationViewProps> = ({
  initialTab,
  onSubtabChange,
}) => {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'project' | 'survey' | 'outline' | 'weekly' | 'supervision' | 'grade'>(initialTab || 'project');
  const [loading, setLoading] = useState(true);

  // Project Data
  const [projectData, setProjectData] = useState<any>(null);

  const currentStageNum = getProjectStageNumber(projectData);

  const handleSelectTab = (tabKey: 'project' | 'survey' | 'outline' | 'weekly' | 'supervision' | 'grade') => {
    const targetStage = GRADUATION_STAGES.find((s) => s.key === tabKey);
    if (targetStage && targetStage.number > currentStageNum) {
      alert(`⚠️ Bạn hiện đang ở Giai đoạn ${currentStageNum}. Cần được Giảng viên hướng dẫn duyệt các bước trước để mở ${targetStage.label}!`);
      return;
    }
    setActiveTab(tabKey);
    if (onSubtabChange) {
      onSubtabChange(tabKey);
    }
  };

  // Sync subtab from initialTab prop
  useEffect(() => {
    if (initialTab && ['project', 'survey', 'outline', 'weekly', 'supervision', 'grade'].includes(initialTab)) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Sync subtab from searchParams or global event
  useEffect(() => {
    const subtab = searchParams.get('subtab');
    if (subtab && ['project', 'survey', 'outline', 'weekly', 'supervision', 'grade'].includes(subtab)) {
      setActiveTab(subtab as any);
      if (onSubtabChange) onSubtabChange(subtab as any);
    }

    const handleSwitchSubtab = (e: any) => {
      const st = e.detail?.subtab;
      if (st && ['project', 'survey', 'outline', 'weekly', 'supervision', 'grade'].includes(st)) {
        setActiveTab(st as any);
        if (onSubtabChange) onSubtabChange(st as any);
      }
    };

    window.addEventListener('app:switch-subtab', handleSwitchSubtab);
    return () => window.removeEventListener('app:switch-subtab', handleSwitchSubtab);
  }, [searchParams, onSubtabChange]);

  // Survey Data
  const [surveyData, setSurveyData] = useState<any>(null);
  const [isInterning, setIsInterning] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [topicDirectionId, setTopicDirectionId] = useState<number | string>('');
  const [preference1Id, setPreference1Id] = useState<number | string>('');
  const [preference2Id, setPreference2Id] = useState<number | string>('');
  const [preference3Id, setPreference3Id] = useState<number | string>('');
  const [secondaryCriteriaNote, setSecondaryCriteriaNote] = useState('');
  const [tentativeTitle, setTentativeTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [surveySaving, setSurveySaving] = useState(false);
  const [showAllSupervisors, setShowAllSupervisors] = useState(false);

  // Helper: Filter supervisors by selected topic direction (GĐ 1 yeucau.md)
  const selectedTopic = surveyData?.topic_areas?.find((t: any) => String(t.id) === String(topicDirectionId));
  const availableSupervisors = React.useMemo(() => {
    if (!surveyData?.supervisors) return [];
    if (!topicDirectionId || showAllSupervisors) return surveyData.supervisors;

    const topicCode = (selectedTopic?.code || '').toUpperCase();
    const topicName = (selectedTopic?.name || '').toLowerCase();

    const matches = surveyData.supervisors.filter((s: any) => {
      const dept = (s.department || '').toLowerCase();
      const interest = (s.research_interest || '').toLowerCase();

      if (topicCode === 'WEB_MOBILE' || topicName.includes('web') || topicName.includes('phần mềm')) {
        if (dept.includes('phần mềm') || interest.includes('web') || interest.includes('phần mềm') || interest.includes('mobile')) return true;
      }
      if (topicCode === 'AI_ML' || topicName.includes('trí tuệ') || topicName.includes('máy học') || topicName.includes('khoa học máy tính')) {
        if (dept.includes('khoa học máy tính') || interest.includes('ai') || interest.includes('trí tuệ') || interest.includes('học máy') || interest.includes('khoa học')) return true;
      }
      if (topicCode === 'DATA_SCI' || topicName.includes('dữ liệu') || topicName.includes('hệ thống thông tin')) {
        if (dept.includes('hệ thống thông tin') || interest.includes('dữ liệu') || interest.includes('data') || interest.includes('thông tin')) return true;
      }
      if (topicCode === 'CYBER_SEC' || topicCode === 'IOT_EMBED' || topicName.includes('an toàn') || topicName.includes('mạng') || topicName.includes('nhúng')) {
        if (dept.includes('mạng') || interest.includes('mạng') || interest.includes('an ninh') || interest.includes('bảo mật') || interest.includes('iot')) return true;
      }
      return interest.includes(topicName) || topicName.includes(interest);
    });

    return matches.length > 0 ? matches : surveyData.supervisors;
  }, [surveyData?.supervisors, topicDirectionId, showAllSupervisors, selectedTopic]);

  // Outline Form & Phase 3 Topic Draft / PDF
  const [outlineTitleVi, setOutlineTitleVi] = useState('');
  const [outlineTitleEn, setOutlineTitleEn] = useState('');
  const [outlineFile] = useState<File | null>(null);
  const [draftTopicVi, setDraftTopicVi] = useState('');
  const [draftTopicEn, setDraftTopicEn] = useState('');
  const [savingDraftTopic, setSavingDraftTopic] = useState(false);
  const [generatingOutlinePdf, setGeneratingOutlinePdf] = useState(false);
  const [signedOutlineFile, setSignedOutlineFile] = useState<File | null>(null);
  const [uploadingSignedOutline, setUploadingSignedOutline] = useState(false);

  // UTC Outline Template States (Giai đoạn 2 yeucau.md)
  const [topicObjective, setTopicObjective] = useState('');
  const [outlineObjectives, setOutlineObjectives] = useState('');
  const [outlineScope, setOutlineScope] = useState('');
  const [outlineWorkPlan, setOutlineWorkPlan] = useState('');
  const [outlineDeliverables, setOutlineDeliverables] = useState('');
  const [savingTemplateDraft, setSavingTemplateDraft] = useState(false);
  const [submittingOutlineTemplate, setSubmittingOutlineTemplate] = useState(false);
  const [showSurveyInProjectTab, setShowSurveyInProjectTab] = useState(false);

  // Weekly Reports Data
  const [weeklyReports, setWeeklyReports] = useState<any[]>([]);
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [weekSummary, setWeekSummary] = useState('');
  const [weekTasks, setWeekTasks] = useState('');
  const [weekGit, setWeekGit] = useState('');
  const [weekFile, setWeekFile] = useState<File | null>(null);
  const [reportSubmitting, setReportSubmitting] = useState(false);

  // Supervision Meeting Logs & Interactive Task Board Data
  const [meetingLogs, setMeetingLogs] = useState<any[]>([]);
  const [tasksData, setTasksData] = useState<{
    stats: { total: number; completed: number; in_progress: number; todo: number; completion_rate: number };
    tasks: any[];
  } | null>(null);
  const [taskFilter, setTaskFilter] = useState<'ALL' | 'TODO' | 'IN_PROGRESS' | 'COMPLETED'>('ALL');
  const [selectedTaskForNotes, setSelectedTaskForNotes] = useState<any | null>(null);
  const [studentNotesInput, setStudentNotesInput] = useState('');
  const [savingTaskNote, setSavingTaskNote] = useState(false);

  // Phase 5: Task Deliverable Submission Modal State
  const [selectedTaskForDeliverable, setSelectedTaskForDeliverable] = useState<any | null>(null);
  const [deliverableFile, setDeliverableFile] = useState<File | null>(null);
  const [deliverableUrl, setDeliverableUrl] = useState('');
  const [deliverableNotes, setDeliverableNotes] = useState('');
  const [submittingDeliverable, setSubmittingDeliverable] = useState(false);

  // Deferral Request Modal (Nhánh bảo lưu)
  const [showDeferralModal, setShowDeferralModal] = useState(false);
  const [deferralReasonCategory, setDeferralReasonCategory] = useState<'HEALTH' | 'ACADEMIC' | 'FINANCIAL' | 'PERSONAL'>('ACADEMIC');
  const [deferralReasonDetails, setDeferralReasonDetails] = useState('');
  const [deferralEvidenceFile, setDeferralEvidenceFile] = useState<File | null>(null);
  const [submittingDeferral, setSubmittingDeferral] = useState(false);
  const [deferralRequests, setDeferralRequests] = useState<ThesisDeferralRequest[]>([]);

  const getHeaders = () => {
    const token = localStorage.getItem('access_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [surveyRes, projRes, weeklyRes, logsRes, tasksRes, deferralRes] = await Promise.all([
        axios.get(`${API_BASE}/student/survey/`, { headers: getHeaders() }).catch(() => null),
        axios.get(`${API_BASE}/student/graduation-project/`, { headers: getHeaders() }).catch(() => null),
        axios.get(`${API_BASE}/student/weekly-reports/`, { headers: getHeaders() }).catch(() => null),
        axios.get(`${API_BASE}/student/supervision-logs/`, { headers: getHeaders() }).catch(() => null),
        axios.get(`${API_BASE}/student/tasks/`, { headers: getHeaders() }).catch(() => null),
        apiService.getStudentDeferralRequests().catch(() => []),
      ]);

      if (surveyRes?.data) {
        setSurveyData(surveyRes.data);
        setPhone(surveyRes.data.student?.phone_number || '');
        setEmail(surveyRes.data.student?.email || '');
        if (surveyRes.data.survey) {
          setIsInterning(surveyRes.data.survey.is_interning);
          setCompanyName(surveyRes.data.survey.company_name || '');
          setTopicDirectionId(surveyRes.data.survey.topic_direction || '');
          const p1 = surveyRes.data.survey.preference_1 || surveyRes.data.survey.preferred_supervisor || '';
          setPreference1Id(p1);
          setPreference2Id(surveyRes.data.survey.preference_2 || '');
          setPreference3Id(surveyRes.data.survey.preference_3 || '');
          setSecondaryCriteriaNote(surveyRes.data.survey.secondary_criteria_note || '');
          setTentativeTitle(surveyRes.data.survey.tentative_title || '');
        }
      }

      if (projRes?.data?.has_project) {
        const p = projRes.data.project;
        setProjectData(p);
        setOutlineTitleVi(p.topic_title_vi || '');
        setOutlineTitleEn(p.topic_title_en || '');
        setDraftTopicVi(p.topic_title_vi || '');
        setDraftTopicEn(p.topic_title_en || '');

        const tpl = p.outline_review?.template_data || {};
        setTopicObjective(tpl.topic_objective || '');
        setOutlineObjectives(tpl.objectives || '');
        setOutlineScope(tpl.scope || '');
        setOutlineWorkPlan(tpl.work_plan || '');
        setOutlineDeliverables(tpl.deliverables || '');
      }

      if (weeklyRes?.data) {
        setWeeklyReports(weeklyRes.data);
      }

      if (logsRes?.data) {
        setMeetingLogs(logsRes.data);
      }

      if (tasksRes?.data) {
        setTasksData(tasksRes.data);
      }

      if (deferralRes) {
        setDeferralRequests(Array.isArray(deferralRes) ? deferralRes : []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggleTaskComplete = async (task: any) => {
    try {
      const nextCompleted = !task.is_completed;
      if (tasksData) {
        const updatedTasks = tasksData.tasks.map((t: any) =>
          t.id === task.id ? { ...t, is_completed: nextCompleted, status: nextCompleted ? 'COMPLETED' : 'IN_PROGRESS' } : t
        );
        const completedCount = updatedTasks.filter((t: any) => t.is_completed).length;
        setTasksData({
          ...tasksData,
          stats: {
            ...tasksData.stats,
            completed: completedCount,
            completion_rate: tasksData.stats.total > 0 ? Math.round((completedCount / tasksData.stats.total) * 1000) / 10 : 0,
          },
          tasks: updatedTasks,
        });
      }

      await axios.patch(
        `${API_BASE}/student/tasks/${task.id}/complete/`,
        { is_completed: nextCompleted },
        { headers: getHeaders() }
      );
      const refreshTasks = await axios.get(`${API_BASE}/student/tasks/`, { headers: getHeaders() }).catch(() => null);
      if (refreshTasks?.data) setTasksData(refreshTasks.data);
    } catch (err: any) {
      alert('Lỗi cập nhật nhiệm vụ: ' + (err.response?.data?.detail || err.message));
      const refreshTasks = await axios.get(`${API_BASE}/student/tasks/`, { headers: getHeaders() }).catch(() => null);
      if (refreshTasks?.data) setTasksData(refreshTasks.data);
    }
  };

  const handleOpenNotesModal = (task: any) => {
    setSelectedTaskForNotes(task);
    setStudentNotesInput(task.student_notes || '');
  };

  const handleSaveStudentNotes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskForNotes) return;
    try {
      setSavingTaskNote(true);
      await axios.patch(
        `${API_BASE}/student/tasks/${selectedTaskForNotes.id}/complete/`,
        { student_notes: studentNotesInput },
        { headers: getHeaders() }
      );
      alert('Đã lưu ghi chú tiến độ nhiệm vụ thành công!');
      setSelectedTaskForNotes(null);
      const refreshTasks = await axios.get(`${API_BASE}/student/tasks/`, { headers: getHeaders() }).catch(() => null);
      if (refreshTasks?.data) setTasksData(refreshTasks.data);
    } catch (err: any) {
      alert('Lỗi lưu ghi chú: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSavingTaskNote(false);
    }
  };

  const handleSaveSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSurveySaving(true);
      await axios.post(
        `${API_BASE}/student/survey/`,
        {
          is_interning: isInterning,
          company_name: companyName,
          topic_direction: topicDirectionId || null,
          preferred_supervisor: preference1Id || null,
          preference_1: preference1Id || null,
          preference_2: preference2Id || null,
          preference_3: preference3Id || null,
          secondary_criteria_note: secondaryCriteriaNote,
          tentative_title: tentativeTitle,
          phone_number: phone,
          email: email,
          new_password: newPassword || undefined,
        },
        { headers: getHeaders() }
      );
      alert('Đã lưu thông tin khảo sát và nguyện vọng thành công!');
      fetchData();
    } catch (err: any) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.detail ||
        err.response?.data?.preference_1?.[0] ||
        err.response?.data?.company_name?.[0] ||
        JSON.stringify(err.response?.data) ||
        err.message;
      alert('Lỗi: ' + msg);
    } finally {
      setSurveySaving(false);
    }
  };

  const handleSaveDraftTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectData?.id || !draftTopicVi.trim()) {
      alert('Vui lòng nhập tên đề tài tiếng Việt.');
      return;
    }
    try {
      setSavingDraftTopic(true);
      await apiService.submitTopicDraft({
        project_id: projectData.id,
        topic_title_vi: draftTopicVi.trim(),
        topic_title_en: draftTopicEn.trim(),
        topic_objective: topicObjective.trim(),
      });
      alert('Đã cập nhật bản thảo đề tài (Draft) kèm mục tiêu! Đang chờ GVHD xác nhận.');
      fetchData();
    } catch (err: any) {
      alert('Lỗi lưu đề tài: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSavingDraftTopic(false);
    }
  };

  const handleLoadSampleTemplate = () => {
    if (!topicObjective) {
      setTopicObjective(
        'Nghiên cứu cơ sở lý thuyết, phân tích nghiệp vụ và xây dựng hệ thống phần mềm hoàn chỉnh nhằm tối ưu hóa quy trình nghiệp vụ thực tế tại UTC.'
      );
    }
    setOutlineObjectives(
      '1. Nghiên cứu tổng quan bài toán và cơ sở lý thuyết liên quan.\n' +
      '2. Khảo sát yêu cầu người dùng, phân tích quy trình nghiệp vụ và thiết kế kiến trúc hệ thống tổng thể.\n' +
      '3. Hiện thực hóa các phân hệ chức năng cốt lõi, áp dụng tiêu chuẩn bảo mật RBAC và tối ưu trải nghiệm người dùng.\n' +
      '4. Kiểm thử chức năng, đánh giá hiệu năng hệ thống và triển khai thực nghiệm nghiệm thu.'
    );
    setOutlineScope(
      '- Phạm vi ứng dụng: Thử nghiệm tại Trường Đại học Giao thông Vận tải (UTC).\n' +
      '- Giới hạn chức năng: Tập trung vào quy trình nghiệp vụ cốt lõi, quản lý vòng đời dữ liệu và phân quyền đa cấp độ.\n' +
      '- Công nghệ sử dụng: Frontend React/TypeScript, Backend RESTful API Python/Django, Cơ sở dữ liệu PostgreSQL.'
    );
    setOutlineWorkPlan(
      '- Tuần 1-3: Nghiên cứu tài liệu, xác định phạm vi đề tài và hoàn thiện đề cương chi tiết.\n' +
      '- Tuần 4-6: Phân tích thiết kế hệ thống, mô hình hóa cơ sở dữ liệu và thiết kế giao diện UI/UX.\n' +
      '- Tuần 7-11: Lập trình phát triển các module chức năng chính và viết Unit Test kiểm thử.\n' +
      '- Tuần 12-13: Tích hợp hệ thống, kiểm thử chịu tải và sửa lỗi phát sinh.\n' +
      '- Tuần 14-15: Viết báo cáo thuyết minh ĐATN, xin ý kiến đánh giá từ GVHD và đóng gói mã nguồn.\n' +
      '- Tuần 16: Hoàn thiện slide thuyết trình và bảo vệ trước Hội đồng chấm ĐATN.'
    );
    setOutlineDeliverables(
      '1. Toàn bộ mã nguồn hoàn chỉnh của hệ thống (kèm tài liệu hướng dẫn cài đặt và cấu hình chi tiết).\n' +
      '2. Bản báo cáo thuyết minh Đồ án tốt nghiệp (file PDF và bản in đóng quyển bìa cứng).\n' +
      '3. Slide báo cáo thuyết trình trước Hội đồng chấm ĐATN.\n' +
      '4. Bản chạy thử nghiệm (Demo trực tiếp) hoạt động ổn định.'
    );
  };

  const handleSaveOutlineTemplate = async (action: 'draft' | 'submit') => {
    const titleVi = (draftTopicVi || outlineTitleVi).trim();
    if (!titleVi) {
      alert('Vui lòng nhập tên đề tài tiếng Việt.');
      return;
    }
    if (action === 'submit' && (!outlineObjectives.trim() || !outlineScope.trim())) {
      alert('Vui lòng điền đầy đủ Mục tiêu nghiên cứu và Phạm vi đề tài theo mẫu trước khi nộp chính thức.');
      return;
    }

    try {
      if (action === 'draft') setSavingTemplateDraft(true);
      else setSubmittingOutlineTemplate(true);

      const res = await apiService.submitOutlineTemplate({
        topic_title_vi: titleVi,
        topic_title_en: (draftTopicEn || outlineTitleEn).trim(),
        topic_objective: topicObjective.trim(),
        objectives: outlineObjectives.trim(),
        scope: outlineScope.trim(),
        work_plan: outlineWorkPlan.trim(),
        deliverables: outlineDeliverables.trim(),
        action: action,
        outline_file: outlineFile || undefined,
      });

      alert(res.message || (action === 'draft' ? 'Đã lưu bản thảo đề cương theo mẫu thành công!' : 'Đã nộp đề cương theo mẫu thành công, chờ GVHD thẩm định!'));
      fetchData();
    } catch (err: any) {
      const msg = err.response?.data?.topic_title_vi?.[0] || err.response?.data?.outline_file?.[0] || err.response?.data?.detail || err.message;
      alert('Lỗi lưu đề cương: ' + msg);
    } finally {
      setSavingTemplateDraft(false);
      setSubmittingOutlineTemplate(false);
    }
  };

  const handleExportOutlinePdf = async () => {
    if (!projectData?.id) return;
    try {
      setGeneratingOutlinePdf(true);
      const blob = await apiService.exportOutlinePdf(projectData.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `De_cuong_DATN_${projectData.student_reg_no || 'UTC'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Lỗi xuất PDF đề cương: ' + (err.response?.data?.detail || err.message));
    } finally {
      setGeneratingOutlinePdf(false);
    }
  };

  const handleUploadSignedOutline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectData?.id || !signedOutlineFile) {
      alert('Vui lòng chọn file đề cương PDF đã có chữ ký.');
      return;
    }
    try {
      setUploadingSignedOutline(true);
      await apiService.uploadSignedOutline(projectData.id, signedOutlineFile);
      alert('Đã nộp đề cương có chữ ký thành công! Khoa đã lưu hồ sơ.');
      setSignedOutlineFile(null);
      fetchData();
    } catch (err: any) {
      alert('Lỗi nộp hồ sơ đề cương: ' + (err.response?.data?.detail || err.message));
    } finally {
      setUploadingSignedOutline(false);
    }
  };

  const handleSubmitDeliverable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskForDeliverable) return;
    if (!deliverableFile && !deliverableUrl.trim()) {
      alert('Vui lòng đính kèm file kết quả hoặc nhập link URL sản phẩm (GitHub/Drive/Demo).');
      return;
    }
    try {
      setSubmittingDeliverable(true);
      const fd = new FormData();
      if (deliverableFile) fd.append('deliverable_file', deliverableFile);
      if (deliverableUrl.trim()) fd.append('deliverable_url', deliverableUrl.trim());
      if (deliverableNotes.trim()) fd.append('student_notes', deliverableNotes.trim());

      await apiService.submitTaskDeliverable(selectedTaskForDeliverable.id, fd);
      alert('Đã nộp kết quả thực hiện nhiệm vụ thành công! Đang chờ GVHD đánh giá.');
      setSelectedTaskForDeliverable(null);
      setDeliverableFile(null);
      setDeliverableUrl('');
      setDeliverableNotes('');
      const refreshTasks = await axios.get(`${API_BASE}/student/tasks/`, { headers: getHeaders() }).catch(() => null);
      if (refreshTasks?.data) setTasksData(refreshTasks.data);
    } catch (err: any) {
      alert('Lỗi nộp sản phẩm: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSubmittingDeliverable(false);
    }
  };

  const handleSubmitDeferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deferralReasonDetails.trim()) {
      alert('Vui lòng nhập lý do chi tiết xin bảo lưu đồ án.');
      return;
    }
    try {
      setSubmittingDeferral(true);
      const fd = new FormData();
      fd.append('reason_category', deferralReasonCategory);
      fd.append('reason_details', deferralReasonDetails.trim());
      if (deferralEvidenceFile) fd.append('evidence_file', deferralEvidenceFile);

      await apiService.submitStudentDeferralRequest(fd);
      alert('Đã gửi đơn xin bảo lưu đồ án thành công! Đang chờ Ban Chủ nhiệm Khoa xem xét.');
      setDeferralReasonDetails('');
      setDeferralEvidenceFile(null);
      setShowDeferralModal(false);
      const deferrals = await apiService.getStudentDeferralRequests().catch(() => []);
      setDeferralRequests(Array.isArray(deferrals) ? deferrals : []);
    } catch (err: any) {
      alert('Lỗi nộp đơn bảo lưu: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSubmittingDeferral(false);
    }
  };



  const handleSubmitWeeklyReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!weekSummary) {
      alert('Vui lòng nhập nội dung tóm tắt công việc đã làm trong tuần.');
      return;
    }

    try {
      setReportSubmitting(true);
      const fd = new FormData();
      fd.append('week_number', selectedWeek.toString());
      fd.append('summary_content', weekSummary);
      fd.append('planned_tasks', weekTasks);
      fd.append('git_commit_link', weekGit);
      if (weekFile) {
        fd.append('attached_file', weekFile);
      }

      await axios.post(`${API_BASE}/student/weekly-reports/`, fd, {
        headers: { ...getHeaders(), 'Content-Type': 'multipart/form-data' },
      });
      alert(`Đã nộp báo cáo tiến độ Tuần ${selectedWeek} thành công!`);
      setWeekSummary('');
      setWeekTasks('');
      setWeekGit('');
      setWeekFile(null);
      fetchData();
    } catch (err: any) {
      alert('Lỗi nộp báo cáo: ' + JSON.stringify(err.response?.data || err.message));
    } finally {
      setReportSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-400">Đang tải thông tin học vụ ĐATN...</div>;
  }

  return (
    <div className="space-y-6">
      {/* 6-Stage Workflow Stepper Bar */}
      <div className="utc-stepper-bar">
        <div className="utc-stepper-label">
          <span className="utc-stepper-pulse"></span>
          <span>Tiến trình 6 Giai Đoạn ĐATN:</span>
        </div>
        <div className="utc-stepper-group">
          {GRADUATION_STAGES.map((tab) => {
            const isCurrent = tab.number === currentStageNum;
            const isCompleted = tab.number < currentStageNum;
            const isLocked = tab.number > currentStageNum;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleSelectTab(tab.key)}
                className={`utc-stepper-item ${activeTab === tab.key ? 'active' : ''} ${isLocked ? 'locked' : ''}`}
                style={{
                  cursor: isLocked ? 'not-allowed' : 'pointer',
                  opacity: isLocked ? 0.55 : 1,
                  position: 'relative',
                }}
                title={
                  isLocked
                    ? `Chờ GVHD duyệt để mở Giai đoạn ${tab.number}`
                    : isCurrent
                    ? `Giai đoạn hiện tại (${tab.number}/6) - Đang thực hiện`
                    : `Giai đoạn ${tab.number} (Đã hoàn thành)`
                }
              >
                <span>{isLocked ? '🔒' : tab.icon}</span>
                <span>{tab.shortLabel}</span>
                {isCurrent && (
                  <span
                    style={{
                      background: '#0284c7',
                      color: '#fff',
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      padding: '1px 5px',
                      borderRadius: '8px',
                      marginLeft: '4px',
                    }}
                  >
                    Đang làm
                  </span>
                )}
                {isCompleted && (
                  <span style={{ color: '#10b981', fontSize: '0.75rem', marginLeft: '2px', fontWeight: 'bold' }}>✓</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab 1: Project Overview */}
      {activeTab === 'project' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6 shadow-xl">
          {projectData ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono px-2.5 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold">
                      Trạng thái: {projectData.status_display || projectData.status}
                    </span>
                    {/* Phê duyệt đề tài từ Khoa */}
                    {(projectData.topic_review_status === 'APPROVED' || projectData.status === 'TOPIC_APPROVED') && (
                      <span className="text-xs px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold">
                        ✅ Khoa đã phê duyệt đề tài
                      </span>
                    )}
                    {(projectData.topic_review_status === 'REVISION_REQUIRED' || projectData.status === 'TOPIC_REVISION') && (
                      <span className="text-xs px-2.5 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold animate-pulse">
                        ⚠️ Khoa yêu cầu sửa đề tài
                      </span>
                    )}
                    {projectData.topic_review_status === 'GV_CONFIRMED' && (
                      <span className="text-xs px-2.5 py-1 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40 font-medium">
                        ⏳ Chờ Khoa phê duyệt đề tài
                      </span>
                    )}
                    {/* Xét duyệt điều kiện học vụ */}
                    {(projectData.initial_eligibility === 'FORCE_APPROVED' || projectData.is_force_approved) && (
                      <span className="text-xs px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                        ⚡ Duyệt đặc cách (Force Approved)
                      </span>
                    )}
                    {(projectData.initial_eligibility === 'ELIGIBLE' || projectData.final_academic_eligibility === 'ELIGIBLE' || projectData.academic_clearance_status === 'ELIGIBLE' || projectData.academic_clearance_status === 'CLEARED') && (
                      <span className="text-xs px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                        ✅ Đủ điều kiện học vụ
                      </span>
                    )}
                    {(projectData.initial_eligibility === 'INELIGIBLE' || projectData.final_academic_eligibility === 'INELIGIBLE' || projectData.academic_clearance_status === 'FAILED') && !projectData.is_force_approved && (
                      <span className="text-xs px-2.5 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold">
                        ⚠️ Chưa đạt điều kiện học vụ
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-bold text-slate-100 mt-2">{projectData.topic_title_vi}</h3>
                  {projectData.topic_title_en && (
                    <p className="text-sm text-slate-400 italic mt-0.5">{projectData.topic_title_en}</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowDeferralModal(true)}
                  className="utc-btn utc-btn-deferral"
                  title="Nộp hoặc xem tiến độ đơn xin hoãn / bảo lưu ĐATN"
                >
                  <span>📝</span>
                  <span>Đơn xin bảo lưu</span>
                  <span className="utc-deferral-count">{deferralRequests.length}</span>
                </button>
              </div>

              {/* Action Banner: Khi Khoa yêu cầu sửa đề tài */}
              {(projectData.topic_review_status === 'REVISION_REQUIRED' || projectData.status === 'TOPIC_REVISION') && (
                <div className="utc-action-banner-revision">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🚨</span>
                      <div>
                        <h4 className="font-bold text-sm text-rose-100">Khoa CNTT Yêu Cầu Chỉnh Sửa Lại Đề Tài</h4>
                        <p className="text-xs text-rose-300/80">Bạn cần trao đổi với GVHD, điều chỉnh lại đề tài và nộp lại bản thảo.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectTab('outline')}
                      className="utc-btn utc-btn-topic-revision"
                    >
                      <span>✏️ Chỉnh sửa đề tài ngay</span>
                      <span>➔</span>
                    </button>
                  </div>
                  <div className="p-3 mt-3 rounded-lg bg-black/40 border border-rose-500/30 text-rose-200 text-xs">
                    <span className="font-semibold text-rose-300">Ý kiến nhận xét từ Ban Chủ nhiệm Khoa: </span>
                    <strong className="text-white">"{projectData.topic_revision_notes || 'Cần điều chỉnh nội dung theo góp ý của Khoa'}"</strong>
                  </div>
                </div>
              )}

              {/* Action Banner: Khi Khoa đã phê duyệt đề tài */}
              {(projectData.topic_review_status === 'APPROVED' || projectData.status === 'TOPIC_APPROVED') && (
                <div className="utc-action-banner-approved">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🎉</span>
                      <div>
                        <h4 className="font-bold text-sm text-emerald-100">Đề Tài Đã Được Khoa Phê Duyệt Chính Thức</h4>
                        <p className="text-xs text-emerald-300/80">Đề tài đã hoàn tất phê duyệt. Sinh viên tiến hành bước kế tiếp: Xuất & Ký nộp Đề cương.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelectTab('outline')}
                      className="utc-btn utc-btn-topic-approved"
                    >
                      <span>📄 Xuất Đề Cương & Nộp Bản Ký</span>
                      <span>➔</span>
                    </button>
                  </div>
                  <p className="text-slate-300 text-xs mt-2">
                    Hãy vào mục <b>"3. Đề cương ĐATN"</b> để tải file PDF đề cương chi tiết chuẩn UTC, lấy chữ ký GVHD và tải bản scan lên hệ thống để lưu trữ.
                  </p>
                </div>
              )}

              {/* Notification: Khoa Force Approve đặc cách */}
              {projectData.initial_eligibility === 'FORCE_APPROVED' && (
                <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs space-y-1">
                  <div className="flex items-center gap-2 font-bold text-amber-100">
                    <span>⚡</span>
                    <span>Quyết định Đặc cách (Force Approve) từ Ban Chủ nhiệm Khoa:</span>
                  </div>
                  <p className="text-slate-300">
                    {projectData.ineligibility_reason || 'Khoa phê duyệt đặc cách theo đơn giải trình và cho phép sinh viên tiếp tục làm ĐATN.'}
                  </p>
                </div>
              )}

              {projectData.status === 'DISQUALIFIED' && (
                <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs space-y-1">
                  <h5 className="font-bold text-rose-200 text-sm">❌ Đồ án không đủ điều kiện làm trong đợt này (Bị loại khỏi đợt)</h5>
                  <p>
                    Hồ sơ học vụ chưa đáp ứng tiêu chuẩn tối thiểu (CPA &lt; 2.0 hoặc thiếu điều kiện tiên quyết).
                    Sinh viên có thể nộp <b>Đơn xin bảo lưu</b> bằng nút phía trên để Ban Chủ nhiệm Khoa xem xét bảo lưu kết quả sang đợt kế tiếp.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-1">
                  <span className="text-xs text-slate-400 font-medium">Giảng viên hướng dẫn (GVHD)</span>
                  <p className="text-base font-bold text-emerald-400">
                    {projectData.supervisor?.full_name || 'Chưa phân công'}
                  </p>
                  <p className="text-xs text-slate-400">Bộ môn: {projectData.supervisor?.department || 'CNTT'}</p>
                  <p className="text-xs text-slate-400">Email: {projectData.supervisor?.email || 'N/A'}</p>
                </div>

                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-1">
                  <span className="text-xs text-slate-400 font-medium">Giảng viên phản biện (GVPB)</span>
                  <p className="text-base font-bold text-indigo-400">
                    {projectData.reviewer?.full_name || <span className="text-slate-500 italic">Đang phân bổ...</span>}
                  </p>
                  <p className="text-xs text-slate-400">Bộ môn: {projectData.reviewer?.department || 'Khoa CNTT'}</p>
                </div>

                <div className="bg-slate-950 p-4 rounded-lg border border-slate-800 space-y-1">
                  <span className="text-xs text-slate-400 font-medium">Hội đồng bảo vệ</span>
                  <p className="text-base font-bold text-amber-400">
                    {projectData.council_name || <span className="text-slate-500 italic">Chưa xếp hội đồng</span>}
                  </p>
                  <p className="text-xs text-slate-400">Phòng: {projectData.defense_room || 'TBA'}</p>
                  <p className="text-xs text-slate-400">Thời gian: {projectData.session_date || 'TBA'} ({projectData.session_time || ''})</p>
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 text-xs text-slate-300 space-y-2">
                <p className="font-bold text-blue-400">Quy trình thực hiện Đồ án Tốt nghiệp chuẩn UTC:</p>
                <ol className="list-decimal pl-5 space-y-1 text-slate-400">
                  <li>Nộp và duyệt Đề cương chi tiết (Tuần 1 - 3).</li>
                  <li>Báo cáo tiến độ tuần thường xuyên cho GVHD (Tuần 1 - 15).</li>
                  <li>GVHD chấm sơ khảo và đánh giá đủ điều kiện bảo vệ.</li>
                  <li>GVPB chấm nhận xét độc lập và Hội đồng chấm bảo vệ trực tiếp.</li>
                </ol>
              </div>
            </>
          ) : (
            <div className="text-center py-12 space-y-3">
              <div className="text-4xl">⏳</div>
              <h4 className="text-lg font-bold text-slate-200">Bạn chưa được phân công Đề tài & GVHD</h4>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                Hãy hoàn thành bước <b>"2. Khảo sát & Nguyện vọng"</b> để Ban chủ nhiệm Khoa CNTT tiến hành phân bổ GVHD theo thuật toán tối ưu MCMF.
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleSelectTab('survey')}
                  className="utc-btn utc-btn-survey-now"
                >
                  <span>📋</span>
                  <span>Điền khảo sát ngay</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeferralModal(true)}
                  className="utc-btn utc-btn-deferral-large"
                >
                  <span>📝</span>
                  <span>Nộp đơn bảo lưu</span>
                  <span className="utc-deferral-count">{deferralRequests.length}</span>
                </button>
              </div>
            </div>
          )}

          {/* Giai đoạn 1: Phiếu Khảo Sát & Đăng ký Nguyện vọng ĐATN */}
          <div className="mt-6 pt-6 border-t border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h4 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <span>📝</span> Phiếu Khảo Sát Hướng Nghiên Cứu & Đăng Ký 3 Nguyện Vọng (GĐ 1)
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sinh viên chọn hướng nghiên cứu chuyên môn và đăng ký 3 nguyện vọng GVHD (NV1, NV2, NV3) theo chỉ tiêu Quota của Khoa.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSurveyInProjectTab(!showSurveyInProjectTab)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition"
              >
                {showSurveyInProjectTab ? '▲ Thu gọn phiếu khảo sát' : '▼ Mở xem / Cập nhật nguyện vọng'}
              </button>
            </div>

            {(!projectData || showSurveyInProjectTab) && (
              <form onSubmit={handleSaveSurvey} className="space-y-4 bg-slate-950 p-5 rounded-xl border border-slate-800">
                {/* Phase 2: Engineer Degree Requirement Warning */}
                {surveyData?.student?.degree_program === 'ENGINEER' && (
                  <div className="p-3.5 rounded-xl bg-purple-950/40 border border-purple-500/40 text-purple-200 text-xs space-y-1">
                    <div className="flex items-center gap-2 font-bold text-sm text-purple-300">
                      <span>🛡️</span>
                      <span>Ràng buộc học vị tối thiểu đối với Chương trình Kỹ sư:</span>
                    </div>
                    <p className="leading-relaxed">
                      Theo quy định của Trường, sinh viên thuộc chương trình đào tạo <b>Kỹ sư</b> bắt buộc phải đăng ký Giảng viên hướng dẫn có học vị tối thiểu là <b>Tiến sĩ (TS, PGS, GS)</b>.
                      Hệ thống đã gắn nhãn <span className="font-semibold text-emerald-400">[TS / Đủ ĐK Kỹ sư]</span> ở danh sách giảng viên hợp lệ.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Số điện thoại liên hệ</label>
                    <input
                      type="text"
                      placeholder="0912345678"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Email sinh viên</label>
                    <input
                      type="email"
                      placeholder="student@utc.edu.vn"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="interning-chk-g1"
                      checked={isInterning}
                      onChange={(e) => setIsInterning(e.target.checked)}
                      className="h-4 w-4 rounded bg-slate-950 border-slate-700 text-blue-600 focus:ring-0"
                    />
                    <label htmlFor="interning-chk-g1" className="text-xs font-medium text-slate-200 cursor-pointer">
                      Tôi đang thực tập / làm việc tại Doanh nghiệp
                    </label>
                  </div>
                  {isInterning && (
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">Tên Công ty / Doanh nghiệp thực tập</label>
                      <input
                        type="text"
                        placeholder="VD: Viettel, FPT Software, VNPT..."
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-medium text-slate-400">
                      Hướng nghiên cứu chuyên sâu (*)
                    </label>
                    {topicDirectionId && (
                      <button
                        type="button"
                        onClick={() => setShowAllSupervisors(!showAllSupervisors)}
                        className="text-[11px] text-blue-400 hover:underline"
                      >
                        {showAllSupervisors ? '✓ Chỉ hiện GV theo hướng NC' : 'Hiện tất cả GV trong Khoa'}
                      </button>
                    )}
                  </div>
                  <select
                    value={topicDirectionId}
                    onChange={(e) => {
                      setTopicDirectionId(e.target.value);
                      setShowAllSupervisors(false);
                    }}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="">-- Chọn hướng nghiên cứu chuyên môn --</option>
                    {surveyData?.topic_areas?.map((t: any) => (
                      <option key={t.id} value={t.id}>
                        {t.name} {t.description ? `(${t.description})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 3 Nguyện vọng GVHD */}
                <div className="space-y-3 pt-2">
                  <h5 className="text-xs font-bold text-slate-300">Đăng ký 3 Nguyện vọng Giảng viên Hướng dẫn:</h5>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Nguyện vọng 1 (Ưu tiên cao nhất) *</label>
                    <select
                      value={preference1Id}
                      onChange={(e) => setPreference1Id(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                    >
                      <option value="">-- Chọn Giảng viên Hướng dẫn NV1 --</option>
                      {availableSupervisors.map((s: any) => (
                        <option key={s.id} value={s.id}>
                          {s.degree_title || s.academic_title ? `[${s.degree_title || s.academic_title}] ` : ''}
                          {s.user?.last_name} {s.user?.first_name} ({s.department || 'Bộ môn'})
                          {s.current_load !== undefined ? ` - Hiện nhận: ${s.current_load}/${s.max_students}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Nguyện vọng 2</label>
                    <select
                      value={preference2Id}
                      onChange={(e) => setPreference2Id(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                    >
                      <option value="">-- Chọn Giảng viên Hướng dẫn NV2 --</option>
                      {availableSupervisors.map((s: any) => (
                        <option key={s.id} value={s.id}>
                          {s.degree_title || s.academic_title ? `[${s.degree_title || s.academic_title}] ` : ''}
                          {s.user?.last_name} {s.user?.first_name} ({s.department || 'Bộ môn'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Nguyện vọng 3</label>
                    <select
                      value={preference3Id}
                      onChange={(e) => setPreference3Id(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                    >
                      <option value="">-- Chọn Giảng viên Hướng dẫn NV3 --</option>
                      {availableSupervisors.map((s: any) => (
                        <option key={s.id} value={s.id}>
                          {s.degree_title || s.academic_title ? `[${s.degree_title || s.academic_title}] ` : ''}
                          {s.user?.last_name} {s.user?.first_name} ({s.department || 'Bộ môn'})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Tên đề tài dự kiến (nếu đã có ý tưởng)</label>
                  <input
                    type="text"
                    placeholder="VD: Nghiên cứu xây dựng ứng dụng WebGIS hỗ trợ phân luồng giao thông..."
                    value={tentativeTitle}
                    onChange={(e) => setTentativeTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Cập nhật mật khẩu mới (để trống nếu không đổi)</label>
                  <input
                    type="password"
                    placeholder="Nhập mật khẩu mới (tối thiểu 6 ký tự)"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={surveySaving}
                    className="utc-btn utc-btn-survey-submit"
                  >
                    <span>💾</span>
                    <span>{surveySaving ? 'Đang lưu...' : 'Lưu Nguyện Vọng ĐATN (GĐ 1)'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Survey & Preferences */}
      {activeTab === 'survey' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6 shadow-xl max-w-4xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>⚖️</span>
                <span>Giai Đoạn 4: Hậu Kiểm Điều Kiện Học Vụ Trước Khi Bảo Vệ</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Theo quy chế đào tạo ĐATN của Trường ĐH Giao thông Vận tải: Giáo vụ kiểm tra nợ đọng tín chỉ.
                <b> Nợ &gt; 0 TC: chuyển Bảo lưu đồ án; Nợ = 0 TC (không nợ tín chỉ): đủ điều kiện đẩy vào danh sách xếp Hội đồng</b>.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-3 py-1 rounded font-bold border ${
                surveyData?.student?.degree_program === 'ENGINEER' || projectData?.student?.degree_program === 'ENGINEER'
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                  : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
              }`}>
                {surveyData?.student?.degree_program === 'ENGINEER' || projectData?.student?.degree_program === 'ENGINEER'
                  ? '⚙️ CT Kỹ sư (Engineer)'
                  : '🎓 CT Cử nhân (Bachelor)'}
              </span>
            </div>
          </div>

          {/* Academic Profile Summary Card */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">Điểm Trung Bình (CPA)</span>
              <span className="text-xl font-bold font-mono text-blue-400">
                {projectData?.student?.cpa || surveyData?.student?.cpa || '3.12'}
              </span>
              <span className="text-[10px] text-slate-500 block mt-1">Thang điểm 4.0</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">Tín chỉ đã tích lũy</span>
              <span className="text-xl font-bold font-mono text-emerald-400">
                {projectData?.student?.accumulated_credits || surveyData?.student?.accumulated_credits || '135+'}
              </span>
              <span className="text-[10px] text-slate-500 block mt-1">Đủ khối lượng kiến thức</span>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">Số tín chỉ nợ đọng</span>
              <span className={`text-xl font-bold font-mono ${
                (projectData?.debt_credits ?? 0) === 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {projectData?.debt_credits ?? 0} TC
              </span>
              <span className="text-[10px] text-slate-500 block mt-1">
                {(projectData?.debt_credits ?? 0) === 0 ? 'Không có nợ tín chỉ' : 'Còn môn học chưa trả nợ'}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[11px] text-slate-400 block mb-1">Trạng thái Hậu kiểm</span>
              {(() => {
                const isForceApproved = projectData?.initial_eligibility === 'FORCE_APPROVED' || projectData?.is_force_approved;
                const isDeferred = projectData?.status === 'DEFERRED' || (projectData?.debt_credits ?? 0) > 0;
                if (isForceApproved) {
                  return <span className="text-xs font-bold text-amber-400">⚡ Duyệt đặc cách</span>;
                }
                if (isDeferred) {
                  return <span className="text-xs font-bold text-rose-400">⚠️ Bảo lưu đồ án</span>;
                }
                return <span className="text-xs font-bold text-emerald-400">✅ Đủ ĐK Bảo vệ</span>;
              })()}
              <span className="text-[10px] text-slate-500 block mt-1">Phòng Đào tạo UTC</span>
            </div>
          </div>

          {/* Conditional Clearance Status Banner */}
          {(() => {
            const isForceApproved = projectData?.initial_eligibility === 'FORCE_APPROVED' || projectData?.is_force_approved;
            const debtCredits = projectData?.debt_credits ?? 0;
            const isDeferred = projectData?.status === 'DEFERRED' || (debtCredits > 0 && !isForceApproved);

            if (isForceApproved) {
              return (
                <div className="p-5 rounded-xl bg-amber-950/40 border border-amber-500/40 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">⚡</span>
                    <h4 className="font-bold text-sm text-amber-200">Được Khoa & Nhà Trường Phê Duyệt Đặc Cách Bảo Vệ</h4>
                  </div>
                  <p className="text-xs text-amber-300/90 leading-relaxed">
                    Hồ sơ đồ án của bạn đã được Ban Chủ nhiệm Khoa và Ban Giám hiệu xét duyệt diện đặc cách (Force Approved).
                    Bạn đủ điều kiện để tham gia bảo vệ ĐATN và được đưa vào danh sách xếp Hội đồng chấm bảo vệ ở Giai đoạn 5.
                  </p>
                </div>
              );
            }

            if (isDeferred) {
              return (
                <div className="p-5 rounded-xl bg-rose-950/40 border border-rose-500/50 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🚨</span>
                    <h4 className="font-bold text-sm text-rose-200">
                      Chưa Đủ Điều Kiện Bảo Vệ - Còn Nợ {debtCredits} Tín Chỉ Học Phần
                    </h4>
                  </div>
                  <p className="text-xs text-rose-300 leading-relaxed">
                    Theo quy chuẩn đào tạo UTC, sinh viên còn nợ tín chỉ học phần (Nợ &gt; 0 TC) <b>bắt buộc phải chuyển sang diện Bảo lưu đồ án</b>,
                    không được tham gia đợt bảo vệ lần này. Vui lòng hoàn thành các môn học còn nợ và làm thủ tục bảo lưu hoặc đăng ký bảo vệ ở đợt kế tiếp.
                  </p>
                  <div className="pt-1 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowDeferralModal(true)}
                      className="utc-btn utc-btn-deferral"
                    >
                      <span>📝</span>
                      <span>Lập Đơn Xin Bảo Lưu ĐATN</span>
                    </button>
                    <span className="text-[11px] text-slate-400">
                      Đã nộp: <b>{deferralRequests.length}</b> đơn xin bảo lưu
                    </span>
                  </div>
                </div>
              );
            }

            return (
              <div className="p-5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🎉</span>
                  <h4 className="font-bold text-sm text-emerald-200">
                    Đủ Điều Kiện Bảo Vệ ĐATN - Không Nợ Tín Chỉ (0 TC)
                  </h4>
                </div>
                <p className="text-xs text-emerald-300/90 leading-relaxed">
                  Chúc mừng bạn! Kết quả hậu kiểm xác nhận bạn đã hoàn thành toàn bộ chương trình đào tạo và không còn nợ tín chỉ nào (Nợ: 0 TC).
                  Hồ sơ của bạn đã đủ điều kiện tuyệt đối và được hệ thống tự động đưa vào danh sách xếp Hội đồng bảo vệ ở <b>Giai đoạn 5</b>.
                </p>
              </div>
            );
          })()}

          {/* Deferral Request Management Section */}
          <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h4 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                  <span>📑</span> Đơn Xin Hoãn / Bảo Lưu Đồ Án Tốt Nghiệp (Thesis Deferral)
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Sinh viên gặp lý do sức khỏe, học vụ hoặc cá nhân có thể gửi đơn xin bảo lưu để được bảo lưu kết quả cho đợt sau.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeferralModal(true)}
                className="utc-btn utc-btn-deferral"
              >
                <span>➕</span>
                <span>Tạo đơn xin bảo lưu</span>
              </button>
            </div>

            {deferralRequests.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                Chưa có đơn xin bảo lưu nào được gửi.
              </div>
            ) : (
              <div className="space-y-3">
                {deferralRequests.map((req: any) => (
                  <div key={req.id} className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-200">
                        Lý do: {req.reason_category_display || req.reason_category}
                      </span>
                      <span className={`px-2 py-0.5 rounded font-bold ${
                        req.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                        req.status === 'REJECTED' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
                        'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}>
                        {req.status === 'APPROVED' ? 'Đã duyệt bảo lưu' :
                         req.status === 'REJECTED' ? 'Từ chối' : 'Đang chờ Khoa duyệt'}
                      </span>
                    </div>
                    <p className="text-slate-300"><b>Chi tiết:</b> {req.reason_details}</p>
                    {req.admin_notes && (
                      <p className="text-slate-400 italic"><b>Ý kiến Khoa:</b> {req.admin_notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* GĐ 2: Chọn Đề Tài & Điền Đề Cương Theo Template */}
      {activeTab === 'outline' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6 shadow-xl max-w-4xl">
          <div>
            <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span>📄</span>
              <span>Giai Đoạn 2: Chọn Đề Tài & Điền Đề Cương Theo Template Có Sẵn</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Quy trình chuẩn UTC: SV đăng ký tên & mục tiêu đề tài → GVHD thẩm định duyệt → SV điền Template đề cương trên hệ thống
              (mục tiêu, phạm vi, kế hoạch, sản phẩm bàn giao) → Tự động sinh PDF có chữ ký → GVHD duyệt đề cương trên hệ thống.
            </p>
          </div>

          {/* Phần 1: Đăng ký Tên & Mục tiêu đề tài */}
          <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-200">1. Đăng ký Tên & Mục tiêu đề tài (Topic Draft & Approval)</h4>
                <p className="text-[11px] text-slate-400">Sinh viên đề xuất tên và mục tiêu cốt lõi để GVHD thẩm định duyệt đạt/không đạt.</p>
              </div>
              {(() => {
                const isTopicApproved = projectData?.topic_review_status === 'APPROVED' || projectData?.status === 'TOPIC_APPROVED';
                const isTopicRevision = projectData?.topic_review_status === 'REVISION_REQUIRED' || projectData?.status === 'TOPIC_REVISION';
                const isTopicConfirmed = projectData?.topic_review_status === 'GV_CONFIRMED' || projectData?.status === 'TOPIC_CONFIRMED' || projectData?.status === 'PENDING_REVIEW';

                return (
                  <span className={`text-xs px-2.5 py-1 rounded font-bold border ${
                    isTopicApproved ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                    isTopicRevision ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse' :
                    isTopicConfirmed ? 'bg-blue-500/20 text-blue-300 border-blue-500/40' :
                    'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  }`}>
                    {isTopicApproved ? '✅ Đề tài đã được phê duyệt' :
                     isTopicRevision ? '⚠️ Cần chỉnh sửa lại đề tài' :
                     isTopicConfirmed ? '⏳ GV đã xác nhận / Chờ Khoa duyệt' :
                     'Bản thảo đề tài (Draft)'}
                  </span>
                );
              })()}
            </div>

            {/* Banner phản hồi khi cần sửa */}
            {(projectData?.topic_review_status === 'REVISION_REQUIRED' || projectData?.status === 'TOPIC_REVISION') && (
              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-200 text-xs space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-rose-100">
                  <span>🚨</span> Ý kiến nhận xét từ Giảng viên / Khoa:
                </div>
                <div className="p-2 rounded bg-black/40 border border-rose-500/30 text-rose-200 font-mono">
                  "{projectData?.topic_revision_notes || 'Cần điều chỉnh mục tiêu và phạm vi nghiên cứu cho phù hợp'}"
                </div>
              </div>
            )}

            <form onSubmit={handleSaveDraftTopic} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Tên đề tài tiếng Việt (*)</label>
                <input
                  type="text"
                  required
                  value={draftTopicVi}
                  onChange={(e) => setDraftTopicVi(e.target.value)}
                  disabled={projectData?.topic_review_status === 'APPROVED' || projectData?.status === 'TOPIC_APPROVED'}
                  placeholder="VD: Nghiên cứu xây dựng ứng dụng hỗ trợ phân luồng giao thông thông minh..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Tên đề tài tiếng Anh</label>
                <input
                  type="text"
                  value={draftTopicEn}
                  onChange={(e) => setDraftTopicEn(e.target.value)}
                  disabled={projectData?.topic_review_status === 'APPROVED' || projectData?.status === 'TOPIC_APPROVED'}
                  placeholder="VD: Research and development of an intelligent traffic routing application..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Mục tiêu tổng quát của đề tài</label>
                <textarea
                  rows={2}
                  value={topicObjective}
                  onChange={(e) => setTopicObjective(e.target.value)}
                  disabled={projectData?.topic_review_status === 'APPROVED' || projectData?.status === 'TOPIC_APPROVED'}
                  placeholder="Mô tả mục đích chính và bài toán cốt lõi mà đồ án sẽ giải quyết..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500 disabled:opacity-60"
                />
              </div>

              {projectData?.topic_review_status !== 'APPROVED' && projectData?.status !== 'TOPIC_APPROVED' && (
                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={savingDraftTopic}
                    className="utc-btn utc-btn-topic-save"
                  >
                    <span>{savingDraftTopic ? '⏳' : '💾'}</span>
                    <span>{savingDraftTopic ? 'Đang lưu...' : 'Lưu Bản Thảo Tên & Mục Tiêu Đề Tài'}</span>
                  </button>
                </div>
              )}
            </form>
          </div>

          {/* Phần 2: Điền mẫu Template Đề cương chi tiết có sẵn */}
          <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <span>📝</span> 2. Điền mẫu Đề cương chi tiết (Template có sẵn trên hệ thống)
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Sinh viên điền trực tiếp 4 nội dung cốt lõi theo mẫu quy định của Trường ĐH Giao thông Vận tải.
                </p>
              </div>
              <button
                type="button"
                onClick={handleLoadSampleTemplate}
                className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-semibold transition flex items-center gap-1.5"
                title="Tự động điền nội dung mẫu đề cương chuẩn UTC để sinh viên tham khảo và chỉnh sửa"
              >
                <span>⚡</span> Nạp mẫu đề cương chuẩn UTC
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
                  <span>🎯</span> a. Mục tiêu nghiên cứu cụ thể (Objectives) (*)
                </label>
                <textarea
                  rows={3}
                  value={outlineObjectives}
                  onChange={(e) => setOutlineObjectives(e.target.value)}
                  placeholder="Liệt kê các mục tiêu nghiên cứu cụ thể cần đạt được (VD: 1. Nghiên cứu tổng quan, 2. Xây dựng mô hình, 3. Triển khai thử nghiệm)..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500 font-sans"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
                  <span>📐</span> b. Phạm vi nghiên cứu & Giới hạn đề tài (Scope) (*)
                </label>
                <textarea
                  rows={3}
                  value={outlineScope}
                  onChange={(e) => setOutlineScope(e.target.value)}
                  placeholder="Xác định phạm vi áp dụng, đối tượng khảo sát và công nghệ kỹ thuật sử dụng trong đồ án..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500 font-sans"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
                  <span>📅</span> c. Kế hoạch thực hiện theo tuần (Work Plan)
                </label>
                <textarea
                  rows={4}
                  value={outlineWorkPlan}
                  onChange={(e) => setOutlineWorkPlan(e.target.value)}
                  placeholder="Kế hoạch tiến độ 16 tuần thực hiện đồ án (Tuần 1-3, Tuần 4-7, Tuần 8-12, Tuần 13-16)..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500 font-sans"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1 flex items-center gap-1.5">
                  <span>📦</span> d. Sản phẩm bàn giao dự kiến (Deliverables)
                </label>
                <textarea
                  rows={3}
                  value={outlineDeliverables}
                  onChange={(e) => setOutlineDeliverables(e.target.value)}
                  placeholder="Các sản phẩm cụ thể sẽ bàn giao khi nghiệm thu (Mã nguồn, báo cáo thuyết minh PDF, slide thuyết trình, bản demo)..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500 font-sans"
                />
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={savingTemplateDraft || submittingOutlineTemplate}
                  onClick={() => handleSaveOutlineTemplate('draft')}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-2 border border-slate-700"
                >
                  <span>💾</span>
                  <span>{savingTemplateDraft ? 'Đang lưu bản thảo...' : 'Lưu Bản Thảo Đề Cương (Draft)'}</span>
                </button>

                <button
                  type="button"
                  disabled={savingTemplateDraft || submittingOutlineTemplate}
                  onClick={() => handleSaveOutlineTemplate('submit')}
                  className="utc-btn utc-btn-topic-save"
                >
                  <span>🚀</span>
                  <span>{submittingOutlineTemplate ? 'Đang nộp đề cương...' : 'Nộp Đề Cương Theo Mẫu (Chính Thức)'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Phần 3: Sinh Đề cương PDF tự động có chữ ký & Ký nộp */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
              <div className="space-y-1">
                <h4 className="font-bold text-slate-200 text-sm flex items-center gap-1.5">
                  <span>📄</span> 3. Tự động sinh PDF Đề cương có chữ ký
                </h4>
                <p className="text-slate-400">
                  Hệ thống tự động biên dịch toàn bộ dữ liệu mẫu đề cương bạn đã điền ở trên thành file PDF chuẩn form UTC có khung chữ ký.
                </p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleExportOutlinePdf}
                  disabled={generatingOutlinePdf}
                  className="utc-btn utc-btn-export-pdf"
                >
                  <span>📄</span>
                  <span>{generatingOutlinePdf ? 'Đang xuất PDF...' : 'Tải File PDF Đề Cương Tự Động'}</span>
                </button>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
              <div className="space-y-1">
                <h4 className="font-bold text-slate-200 text-sm flex items-center gap-1.5">
                  <span>📤</span> 4. Ký nộp & Lưu hồ sơ Đề cương
                </h4>
                <p className="text-slate-400">
                  Sau khi in và có chữ ký xác nhận của SV & GVHD, scan file PDF và nộp lên hệ thống để lưu hồ sơ tốt nghiệp.
                </p>
              </div>

              {projectData?.signed_outline_file && (
                <div className="p-2 rounded bg-emerald-950/20 border border-emerald-500/20 text-emerald-300 flex items-center justify-between">
                  <span>✅ Đã nộp bản ký:</span>
                  <a
                    href={projectData.signed_outline_file}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-semibold text-emerald-400 hover:text-emerald-300"
                  >
                    Xem hồ sơ ↗
                  </a>
                </div>
              )}

              <form onSubmit={handleUploadSignedOutline} className="space-y-2 pt-1">
                <input
                  type="file"
                  accept=".pdf"
                  required
                  onChange={(e) => setSignedOutlineFile(e.target.files?.[0] || null)}
                  className="w-full text-slate-400 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-[11px] file:bg-slate-800 file:text-slate-200"
                />
                <button
                  type="submit"
                  disabled={uploadingSignedOutline}
                  className="utc-btn utc-btn-upload-outline"
                >
                  <span>📤</span>
                  <span>{uploadingSignedOutline ? 'Đang tải lên...' : 'Nộp File Đề Cương Đã Ký'}</span>
                </button>
              </form>
            </div>
          </div>

          {/* Phần 4: Kết quả thẩm định & Duyệt đề cương của GVHD trên hệ thống */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-300">Kết quả thẩm định đề cương của GVHD:</span>
              <span className={`px-2.5 py-1 rounded font-bold ${
                projectData?.outline_review?.verdict === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' :
                projectData?.outline_review?.verdict === 'REVISION_REQUIRED' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                projectData?.outline_review?.verdict === 'REJECTED' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' :
                'bg-blue-500/20 text-blue-300 border border-blue-500/40'
              }`}>
                {projectData?.outline_review?.verdict === 'APPROVED' ? '✅ ĐÃ DUYỆT ĐẠT (APPROVED)' :
                 projectData?.outline_review?.verdict === 'REVISION_REQUIRED' ? '⚠️ YÊU CẦU CHỈNH SỬA LẠI' :
                 projectData?.outline_review?.verdict === 'REJECTED' ? '❌ KHÔNG ĐẠT / HỦY' :
                 '⏳ ĐANG CHỜ GVHD THẨM ĐỊNH'}
              </span>
            </div>
            {projectData?.outline_review?.comments && (
              <div className="mt-2 p-2.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                <span className="font-semibold text-emerald-400">Ý kiến nhận xét của Giảng viên: </span>
                {projectData.outline_review.comments}
              </div>
            )}
          </div>
        </div>
      )}

      {/* GĐ 5: Hội Đồng & Sắp Xếp Lịch Bảo Vệ */}
      {activeTab === 'weekly' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6 shadow-xl max-w-4xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>🏛️</span>
                <span>Giai Đoạn 5: Thành Lập Hội Đồng & Sắp Xếp Lịch Bảo Vệ</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Theo quy chuẩn UTC: Hội đồng bảo vệ gồm <b>5 thành viên (1 Chủ tịch, 2 Thư ký, 2 Ủy viên)</b>,
                đảm bảo ràng buộc bắt buộc <b>GVHD không thuộc Hội đồng chấm</b> và tự động xếp slot phòng, ca, giờ bảo vệ.
              </p>
            </div>
          </div>

          {projectData?.council || projectData?.council_name ? (
            <div className="space-y-6">
              {/* Defense Schedule & Slot Card */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-2">
                    <span>📅</span> Thông Tin Lịch & Địa Điểm Bảo Vệ
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Hội đồng chấm:</span>
                      <span className="font-bold text-slate-100">{projectData.council_name || `Hội đồng #${projectData.council}`}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Phòng bảo vệ:</span>
                      <span className="font-bold text-emerald-400 text-sm">
                        {projectData.schedule_slot?.room || projectData.defense_room || 'Phòng Chuyên Đề CNTT'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Ngày bảo vệ:</span>
                      <span className="font-bold text-blue-400">
                        {formatDateVN(projectData.schedule_slot?.slot_date || projectData.session_date)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Ca bảo vệ:</span>
                      <span className="font-semibold text-slate-200">
                        {projectData.schedule_slot?.session_time || projectData.session_time || 'Ca sáng (07h30 - 11h30)'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Giờ báo cáo dự kiến:</span>
                      <span className="font-mono font-bold text-amber-300">
                        {projectData.schedule_slot?.start_time
                          ? `${projectData.schedule_slot.start_time} - ${projectData.schedule_slot.end_time}`
                          : 'Theo lượt gọi của Hội đồng'}
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Thứ tự báo cáo (Slot):</span>
                      <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold font-mono">
                        Lượt số {projectData.schedule_slot?.slot_number || 1}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 5 Members of Council */}
                <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-2">
                    <span>👥</span> Danh Sách 5 Thành Viên Hội Đồng
                  </h4>
                  {Array.isArray(projectData.council_members) && projectData.council_members.length > 0 ? (
                    <div className="space-y-2 text-xs">
                      {projectData.council_members.map((m: any, idx: number) => {
                        const style = getRoleBadgeStyle(m.role);
                        return (
                          <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800">
                            <div>
                              <span className="font-semibold text-slate-200 block">{m.full_name || m.name}</span>
                              <span className="text-[10px] text-slate-400">{m.department || 'Khoa CNTT - UTC'}</span>
                            </div>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${style.badge}`}>
                              {m.role_display || (
                                m.role === 'CHAIR' ? 'Chủ tịch HĐ' :
                                m.role === 'SECRETARY' ? 'Thư ký HĐ' :
                                'Ủy viên HĐ'
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 py-4 space-y-1">
                      <p>Hội đồng đã được chỉ định: <b>{projectData.council_name || `Hội đồng #${projectData.council}`}</b>.</p>
                      <p className="text-slate-500">Danh sách chi tiết 5 thành viên đang được Khoa cập nhật vào phiên bảo vệ.</p>
                    </div>
                  )}

                  {/* Academic Integrity Rule confirmation */}
                  <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-center gap-2">
                    <span>🛡️</span>
                    <span>
                      <b>Ràng buộc độc lập:</b> Giảng viên hướng dẫn ({projectData.supervisor_name || 'GVHD'}) hoàn toàn <b>không</b> nằm trong Hội đồng chấm bảo vệ.
                    </span>
                  </div>
                </div>
              </div>

              {/* Defense Preparation Guidelines */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
                <h5 className="font-bold text-slate-200 text-sm flex items-center gap-2">
                  <span>📌</span> Hướng Dẫn Chuẩn Bị Cho Buổi Bảo Vệ ĐATN
                </h5>
                <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
                  <li>Sinh viên chuẩn bị Slide thuyết trình (tối đa 15 slide, thời gian trình bày từ 10 - 15 phút).</li>
                  <li>Mang theo máy tính xách tay cá nhân đã cài đặt sẵn môi trường demo phần mềm hoạt động thực tế.</li>
                  <li>Có mặt trước cửa phòng bảo vệ tối thiểu <b>15 phút</b> so với giờ bắt đầu ca bảo vệ.</li>
                  <li>Trang phục lịch sự (áo sơ mi, quần tây/váy công sở) đúng chuẩn mực tác phong sinh viên UTC.</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
              <span className="text-4xl">⏳</span>
              <h4 className="text-base font-bold text-slate-200">Đang Chuẩn Bị Xếp Lịch & Hội Đồng Bảo Vệ</h4>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Hồ sơ học vụ của bạn đã vượt qua khâu hậu kiểm Giai đoạn 4.
                Khoa CNTT đang hoàn tất việc phân chia Hội đồng 5 người và tự động sắp xếp khung giờ bảo vệ chi tiết.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 5: Supervision Meeting Logs & Interactive Task Board */}
      {activeTab === 'supervision' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <span>📋</span> Ban Nhiệm Vụ Đồ Án (Task Board) & Tiến Độ Hoàn Thành
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Theo dõi danh sách công việc được GVHD giao, đánh dấu hoàn thành và cập nhật kết quả thực hiện.
                </p>
              </div>

              {tasksData?.stats && (
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    Tổng số: {tasksData.stats.total} việc
                  </span>
                  <span className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Đã xong: {tasksData.stats.completed}
                  </span>
                </div>
              )}
            </div>

            {/* Progress Bar */}
            {tasksData?.stats && (
              <div className="space-y-2 bg-slate-950 p-4 rounded-xl border border-slate-800/80">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-300">Tiến độ hoàn thành nhiệm vụ được giao</span>
                  <span className="font-bold text-emerald-400 text-sm">
                    {tasksData.stats.completed} / {tasksData.stats.total} ({tasksData.stats.completion_rate}%)
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 via-teal-400 to-emerald-400 transition-all duration-500"
                    style={{ width: `${tasksData.stats.completion_rate}%` }}
                  />
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800">
              <span className="text-xs text-slate-400 font-medium mr-1">Bộ lọc:</span>
              {[
                { key: 'ALL', label: 'Tất cả nhiệm vụ' },
                { key: 'TODO', label: 'Cần làm (Todo)' },
                { key: 'IN_PROGRESS', label: 'Đang thực hiện' },
                { key: 'COMPLETED', label: 'Đã hoàn thành' },
              ].map((f) => (
                <button
                  key={f.key}
                  onClick={() => setTaskFilter(f.key as any)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                    taskFilter === f.key
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Task List */}
            <div className="space-y-3 pt-2">
              {(() => {
                const list = tasksData?.tasks || [];
                const filtered = list.filter((t) => {
                  if (taskFilter === 'TODO') return !t.is_completed && t.status === 'TODO';
                  if (taskFilter === 'IN_PROGRESS') return !t.is_completed && t.status === 'IN_PROGRESS';
                  if (taskFilter === 'COMPLETED') return t.is_completed;
                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800 text-slate-400 text-xs">
                      {list.length === 0
                        ? 'Chưa có nhiệm vụ nào được giao từ Giảng viên hướng dẫn.'
                        : 'Không có nhiệm vụ nào phù hợp với bộ lọc hiện tại.'}
                    </div>
                  );
                }

                return filtered.map((task) => {
                  const isOverdue = task.due_date && !task.is_completed && new Date(task.due_date) < new Date();
                  return (
                    <div
                      key={task.id}
                      className={`p-4 rounded-xl border transition flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                        task.is_completed
                          ? 'bg-slate-950/60 border-slate-800/80 opacity-80'
                          : 'bg-slate-950 border-slate-800 hover:border-slate-700 shadow-md'
                      }`}
                    >
                      <div className="flex items-start gap-3.5 flex-1">
                        {/* Interactive Checkbox */}
                        <div className="pt-0.5">
                          <input
                            type="checkbox"
                            checked={task.is_completed}
                            onChange={() => handleToggleTaskComplete(task)}
                            className="w-5 h-5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500/20 bg-slate-900 cursor-pointer accent-emerald-500"
                            title="Đánh dấu hoàn thành nhiệm vụ"
                          />
                        </div>

                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-sm font-semibold transition ${
                                task.is_completed ? 'line-through text-slate-400' : 'text-slate-100'
                              }`}
                            >
                              {task.title}
                            </span>

                            {/* Priority Badge */}
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                                task.priority === 'URGENT'
                                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                  : task.priority === 'HIGH'
                                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                  : task.priority === 'LOW'
                                  ? 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                                  : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                              }`}
                            >
                              {task.priority_display || task.priority}
                            </span>

                            {/* Status Badge */}
                            {task.is_completed ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                ✅ Hoàn thành
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-300">
                                {task.status_display || 'Cần làm'}
                              </span>
                            )}

                            {/* Phase 5: Task Review Verdict Badge */}
                            {task.review_verdict && task.review_verdict !== 'NOT_SUBMITTED' && (
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                task.review_verdict === 'ACCEPTED' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' :
                                task.review_verdict === 'REVISION_REQUIRED' ? 'bg-rose-500/20 text-rose-300 border-rose-500/40' :
                                'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              }`}>
                                {task.review_verdict === 'ACCEPTED' ? '🎯 Đạt yêu cầu' :
                                 task.review_verdict === 'REVISION_REQUIRED' ? '⚠️ Yêu cầu sửa lại' :
                                 '⏳ Chờ GV đánh giá'}
                              </span>
                            )}
                          </div>

                          {task.description && (
                            <p className="text-xs text-slate-300 whitespace-pre-line">{task.description}</p>
                          )}

                          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 pt-1">
                            <span>
                              GV giao:{' '}
                              <b className="text-slate-300">{task.assigned_by_name || 'GVHD'}</b>
                            </span>
                            {task.due_date && (
                              <span className={isOverdue ? 'text-rose-400 font-bold' : ''}>
                                ⏰ Hạn chót: <b>{task.due_date}</b> {isOverdue && '(Quá hạn)'}
                              </span>
                            )}
                            {task.completed_at && (
                              <span className="text-emerald-400/80">
                                Hoàn tất lúc: {new Date(task.completed_at).toLocaleDateString('vi-VN')}
                              </span>
                            )}
                          </div>

                          {/* Phase 5: Deliverable display */}
                          {(task.deliverable_file || task.deliverable_url) && (
                            <div className="mt-2 p-2.5 rounded bg-slate-900 border border-slate-800 text-xs space-y-1">
                              <span className="font-semibold text-emerald-400">📦 Sản phẩm / Báo cáo kết quả:</span>
                              <div className="flex flex-wrap items-center gap-3">
                                {task.deliverable_file && (
                                  <a href={task.deliverable_file} target="_blank" rel="noreferrer" className="text-blue-400 underline font-medium hover:text-blue-300">
                                    File đính kèm ↗
                                  </a>
                                )}
                                {task.deliverable_url && (
                                  <a href={task.deliverable_url} target="_blank" rel="noreferrer" className="text-blue-400 underline font-medium hover:text-blue-300">
                                    Link sản phẩm (Git/Drive/Demo) ↗
                                  </a>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Phase 5: Supervisor review notes */}
                          {task.supervisor_review_notes && (
                            <div className={`mt-2 p-2.5 rounded border text-xs ${
                              task.review_verdict === 'REVISION_REQUIRED'
                                ? 'bg-rose-950/30 border-rose-500/30 text-rose-200'
                                : 'bg-emerald-950/20 border-emerald-500/20 text-emerald-200'
                            }`}>
                              <span className="font-semibold">
                                {task.review_verdict === 'REVISION_REQUIRED' ? '⚠️ Yêu cầu sửa từ GVHD:' : '💬 Nhận xét từ GVHD:'}
                              </span>{' '}
                              {task.supervisor_review_notes}
                            </div>
                          )}

                          {/* Student Notes Display */}
                          {task.student_notes && (
                            <div className="mt-2 p-2.5 rounded bg-blue-950/20 border border-blue-500/20 text-xs text-blue-200">
                              <span className="font-semibold text-blue-400">📝 Ghi chú SV:</span>{' '}
                              {task.student_notes}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap items-center gap-2 self-end md:self-center">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedTaskForDeliverable(task);
                            setDeliverableUrl(task.deliverable_url || '');
                            setDeliverableNotes(task.student_notes || '');
                          }}
                          className="utc-btn utc-btn-deliverable"
                        >
                          <span>📤</span>
                          <span>{task.deliverable_file || task.deliverable_url ? 'Nộp lại sản phẩm' : 'Nộp sản phẩm'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenNotesModal(task)}
                          className="utc-btn utc-btn-task-note"
                        >
                          <span>✏️</span>
                          <span>{task.student_notes ? 'Sửa ghi chú' : 'Ghi chú'}</span>
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Supervision Meeting Logs Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
            <div>
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <span>🗓️</span> Nhật Ký Hướng Dẫn Định Kỳ (Supervision Meeting Logs)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Biên bản ghi nhận các buổi làm việc định kỳ giữa Giảng viên hướng dẫn và Sinh viên.
              </p>
            </div>

            {meetingLogs.length === 0 ? (
              <div className="p-8 text-center bg-slate-950 rounded-xl border border-slate-800 text-slate-400 text-xs">
                Chưa có buổi họp/hướng dẫn nào được ghi nhận từ GVHD.
              </div>
            ) : (
              <div className="space-y-4">
                {meetingLogs.map((log, idx) => (
                  <div
                    key={log.id}
                    className="p-5 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-full bg-blue-600/20 text-blue-400 flex items-center justify-center text-xs font-bold border border-blue-500/30">
                          #{meetingLogs.length - idx}
                        </span>
                        <div>
                          <span className="text-sm font-bold text-slate-100">Buổi hướng dẫn: {log.meeting_date}</span>
                          <span className="text-xs text-slate-400 ml-2">({log.meeting_time})</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          ⭐ Căn cứ điểm quá trình
                        </span>
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                            log.meeting_type === 'ONLINE'
                              ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                              : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                          }`}
                        >
                          {log.meeting_type_display || (log.meeting_type === 'ONLINE' ? 'Trực tuyến' : 'Gặp trực tiếp')}
                        </span>
                        {log.location_or_link && (log.meeting_type === 'ONLINE' || log.location_or_link.startsWith('http')) ? (
                          <a
                            href={log.location_or_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition shadow-sm"
                            title="Bấm để tham gia phòng họp trực tuyến Google Meet / Zoom"
                          >
                            <span>📹</span>
                            <span>Tham gia cuộc họp trực tuyến (Google Meet / Zoom) ↗</span>
                          </a>
                        ) : log.location_or_link ? (
                          <span className="text-xs text-slate-300">
                            📍 Địa điểm: <b>{log.location_or_link}</b>
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div>
                        <span className="font-semibold text-slate-300">Nội dung trao đổi & tiến độ:</span>
                        <p className="text-slate-200 mt-1 whitespace-pre-line bg-slate-900/60 p-3 rounded-lg border border-slate-800/60">
                          {log.content_discussed}
                        </p>
                      </div>

                      {log.supervisor_notes && (
                        <div>
                          <span className="font-semibold text-emerald-400">Góp ý & Nhận xét của GVHD:</span>
                          <p className="text-emerald-300/90 mt-1 whitespace-pre-line bg-emerald-950/20 p-3 rounded-lg border border-emerald-500/20">
                            {log.supervisor_notes}
                          </p>
                        </div>
                      )}

                      {log.tasks && log.tasks.length > 0 && (
                        <div className="p-3 rounded-lg bg-blue-950/20 border border-blue-500/20 space-y-1.5">
                          <span className="font-bold text-blue-300">📌 Nhiệm vụ GVHD giao tuần tới:</span>
                          {log.tasks.map((t: any) => (
                            <div key={t.id} className="flex items-center justify-between text-slate-200 pl-2">
                              <span>• <b>{t.title}</b> {t.due_date && <span className="text-slate-400">(Hạn nộp: {t.due_date})</span>}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${t.is_completed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-300'}`}>
                                {t.is_completed ? '✅ Đã xong' : '⏳ Cần làm'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {log.next_meeting_plan && (
                        <div>
                          <span className="font-semibold text-amber-400">Kế hoạch kỳ tới:</span>
                          <p className="text-slate-300 mt-1 whitespace-pre-line bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60">
                            {log.next_meeting_plan}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Báo cáo tiến độ tuần (Weekly Reports) trong GĐ 3 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
            <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-xl">
              <h4 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <span>📊</span> Nộp Báo Cáo Tuần
              </h4>
              <form onSubmit={handleSubmitWeeklyReport} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Chọn tuần (1 đến 15)</label>
                  <select
                    value={selectedWeek}
                    onChange={(e) => setSelectedWeek(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                  >
                    {Array.from({ length: 15 }, (_, i) => i + 1).map((w) => (
                      <option key={w} value={w}>
                        Tuần {w}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Tóm tắt công việc đã làm (*)</label>
                  <textarea
                    rows={4}
                    required
                    placeholder="Mô tả các module, tính năng hoặc nghiên cứu đã hoàn thành trong tuần..."
                    value={weekSummary}
                    onChange={(e) => setWeekSummary(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Kế hoạch tuần tiếp theo</label>
                  <textarea
                    rows={2}
                    placeholder="Kế hoạch thực hiện trong tuần tới..."
                    value={weekTasks}
                    onChange={(e) => setWeekTasks(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Link GitHub / GitLab commit</label>
                  <input
                    type="url"
                    placeholder="https://github.com/user/repo/commits"
                    value={weekGit}
                    onChange={(e) => setWeekGit(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Đính kèm file (nếu có)</label>
                  <input
                    type="file"
                    onChange={(e) => setWeekFile(e.target.files?.[0] || null)}
                    className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded text-slate-300 text-xs file:mr-2 file:py-0.5 file:px-2 file:rounded file:border-0 file:text-xs file:bg-slate-800 file:text-slate-300"
                  />
                </div>

                <button
                  type="submit"
                  disabled={reportSubmitting}
                  className="utc-btn utc-btn-weekly-submit"
                  style={{ width: '100%' }}
                >
                  <span>📊</span>
                  <span>{reportSubmitting ? 'Đang nộp...' : `Nộp Báo cáo Tuần ${selectedWeek}`}</span>
                </button>
              </form>
            </div>

            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-xl">
              <h4 className="font-bold text-base text-slate-100 flex items-center gap-2">
                <span>🗓️</span> Lịch Sử Báo Cáo & Nhận Xét Của GVHD
              </h4>
              {weeklyReports.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-xs">Chưa có báo cáo tuần nào được nộp.</div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {weeklyReports.map((r: any) => (
                    <div key={r.id} className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-blue-400">Tuần {r.week_number}</span>
                        <span className={`px-2 py-0.5 rounded font-semibold ${
                          r.supervisor_rating === 'GOOD' ? 'bg-emerald-500/10 text-emerald-400' :
                          r.supervisor_rating === 'ACCEPTABLE' ? 'bg-blue-500/10 text-blue-400' :
                          r.supervisor_rating === 'LATE' ? 'bg-amber-500/10 text-amber-400' :
                          r.supervisor_rating === 'UNSATISFACTORY' ? 'bg-rose-500/10 text-rose-400' :
                          'bg-slate-800 text-slate-400'
                        }`}>
                          {r.supervisor_rating_display || r.supervisor_rating}
                        </span>
                      </div>

                      <p className="text-slate-200"><b>Nội dung:</b> {r.summary_content}</p>
                      {r.planned_tasks && <p className="text-slate-400"><b>Kế hoạch:</b> {r.planned_tasks}</p>}
                      {r.git_commit_link && (
                        <p className="text-slate-400">
                          <b>Git:</b>{' '}
                          <a href={r.git_commit_link} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
                            {r.git_commit_link}
                          </a>
                        </p>
                      )}

                      {r.supervisor_feedback && (
                        <div className="mt-2 p-2.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                          <span className="font-bold text-emerald-400">Nhận xét GVHD:</span> {r.supervisor_feedback}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 6: Final Grade & Defense Schedule */}
      {activeTab === 'grade' && (() => {
        const scheduleSlot = projectData?.schedule_slot;
        const councilMembers = Array.isArray(projectData?.council_members) ? projectData.council_members : [];
        const councilName = projectData?.council_name || 'Hội đồng Bảo vệ ĐATN';
        const defenseDate = scheduleSlot?.slot_date || projectData?.session_date;
        const defenseRoom = scheduleSlot?.room || projectData?.defense_room;
        const sessionTime = scheduleSlot?.session_time || projectData?.session_time;
        const slotOrder = scheduleSlot?.order_number;
        const timeSlotStr = (scheduleSlot?.start_time && scheduleSlot?.end_time)
          ? `${scheduleSlot.start_time} - ${scheduleSlot.end_time}`
          : (sessionTime || 'Theo thông báo của HĐ');
        const hasSchedule = Boolean(scheduleSlot || projectData?.council_name || projectData?.session_date);

        return (
          <div className="space-y-6 max-w-4xl">
            {/* Header Banner */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30">
                      Giai đoạn 6 / 6
                    </span>
                    {projectData?.is_currently_defending ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                        Đang trong phiên bảo vệ
                      </span>
                    ) : projectData?.final_grade?.is_passed ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                        <span>✓</span> Đã hoàn thành bảo vệ
                      </span>
                    ) : projectData?.is_eligible_for_defense ? (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Đủ điều kiện bảo vệ
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
                        Chuẩn bị bảo vệ
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-extrabold text-white tracking-tight">
                    Lịch Bảo Vệ Đồ Án Tốt Nghiệp & Hội Đồng Chấm Thi
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                    Thông tin chi tiết về phòng bảo vệ, ca thi, thứ tự bảo vệ và danh sách Hội đồng chấm theo Quy chế Đào tạo UTC.
                  </p>
                </div>

                <div className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowDeferralModal(true)}
                    className="utc-btn utc-btn-deferral"
                  >
                    <span>📝</span>
                    <span>Đơn xin bảo lưu</span>
                    <span className="utc-deferral-count">{deferralRequests.length}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Defense Schedule Highlight Card */}
            {hasSchedule ? (
              <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/40 border border-blue-500/30 rounded-2xl p-6 shadow-xl space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-2xl text-blue-400">
                      🏛️
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-blue-400 uppercase tracking-wide">
                        Hội đồng phân bổ
                      </span>
                      <h4 className="text-base font-bold text-white">
                        {councilName}
                      </h4>
                    </div>
                  </div>

                  {slotOrder && (
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-blue-500/20 border border-blue-500/40 self-start sm:self-auto">
                      <span className="text-xs text-blue-300 font-medium">Thứ tự trình bày:</span>
                      <span className="text-sm font-extrabold text-blue-100">
                        Lượt số #{slotOrder}
                      </span>
                    </div>
                  )}
                </div>

                {/* 4 Essential Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                  <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800/80">
                    <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5 mb-1">
                      <span>📅</span> Ngày bảo vệ
                    </span>
                    <p className="text-base font-bold text-white">
                      {formatDateVN(defenseDate)}
                    </p>
                  </div>

                  <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800/80">
                    <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5 mb-1">
                      <span>⏰</span> Khung giờ bảo vệ
                    </span>
                    <p className="text-base font-bold text-emerald-400">
                      {timeSlotStr}
                    </p>
                  </div>

                  <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800/80">
                    <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5 mb-1">
                      <span>📍</span> Địa điểm / Phòng
                    </span>
                    <p className="text-base font-bold text-amber-400">
                      {defenseRoom || 'Chưa công bố'}
                    </p>
                  </div>

                  <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800/80">
                    <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5 mb-1">
                      <span>🌅</span> Buổi / Ca bảo vệ
                    </span>
                    <p className="text-base font-bold text-indigo-300">
                      {sessionTime || 'Ca sáng (08:00)'}
                    </p>
                  </div>
                </div>

                {/* Instruction Banner */}
                <div className="p-3.5 rounded-xl bg-blue-950/30 border border-blue-500/20 text-xs text-blue-200 flex items-start gap-2.5">
                  <span className="text-base leading-none">💡</span>
                  <p className="leading-relaxed">
                    <b>Hướng dẫn bảo vệ:</b> Sinh viên có mặt tại phòng bảo vệ trước giờ quy định <b>15 phút</b>, trang phục lịch sự, chuẩn bị sẵn Slide báo cáo (10–15 phút), bản in báo cáo tóm tắt và sản phẩm phần mềm chạy thử nghiệm.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
                <div className="w-14 h-14 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-3xl">
                  ⏳
                </div>
                <h4 className="text-base font-bold text-slate-200">
                  Lịch bảo vệ chi tiết đang được hoàn tất
                </h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Khoa và Bộ môn đang tổng hợp danh sách sinh viên đủ điều kiện và sắp xếp khung giờ bảo vệ theo từng Hội đồng. Lịch chính thức sẽ hiển thị tại đây ngay khi công bố.
                </p>
              </div>
            )}

            {/* Council Members List Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h4 className="text-base font-bold text-slate-100 flex items-center gap-2">
                    <span>👥</span> Thành Viên Hội Đồng Chấm Thi
                  </h4>
                  <p className="text-xs text-slate-400">
                    Hội đồng chấm bảo vệ trực tiếp và hỏi đáp chuyên môn với sinh viên
                  </p>
                </div>
                {councilMembers.length > 0 && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-300">
                    {councilMembers.length} thành viên
                  </span>
                )}
              </div>

              {councilMembers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {councilMembers.map((member: any) => {
                    const roleStyle = getRoleBadgeStyle(member.role);
                    return (
                      <div
                        key={member.id}
                        className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${roleStyle.avatarBg}`}>
                            {member.name ? member.name.charAt(0) : 'T'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white truncate">
                              {member.display_name || member.name}
                            </p>
                            <p className="text-xs text-slate-400 truncate">
                              {member.department || member.external_institution || 'Trường ĐH Giao thông Vận tải'}
                            </p>
                          </div>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 ${roleStyle.badge}`}>
                          {member.role_display}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-slate-500 italic">
                  Chưa có danh sách thành viên hội đồng được phân công.
                </div>
              )}
            </div>

            {/* Pre-defense Evaluation Scores (GVHD & GVPB) */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
              <div>
                <h4 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <span>📋</span> Đánh Giá Sơ Khảo Trước Bảo Vệ
                </h4>
                <p className="text-xs text-slate-400">
                  Ý kiến nhận xét và điểm số của Giảng viên hướng dẫn & Giảng viên phản biện
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Supervisor card */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-slate-400">Giảng viên hướng dẫn</span>
                      <p className="text-sm font-bold text-emerald-400">
                        {projectData?.supervisor?.full_name || 'Chưa phân công'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500">Điểm hướng dẫn</span>
                      <p className="text-2xl font-extrabold text-emerald-400">
                        {projectData?.supervisor_score !== null && projectData?.supervisor_score !== undefined
                          ? Number(projectData.supervisor_score).toFixed(1)
                          : '-'}
                      </p>
                    </div>
                  </div>
                  {projectData?.supervisor_feedback && (
                    <p className="text-xs text-slate-300 bg-slate-900/70 p-2.5 rounded-lg border border-slate-800 italic">
                      "{projectData.supervisor_feedback}"
                    </p>
                  )}
                </div>

                {/* Reviewer card */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-slate-400">Giảng viên phản biện</span>
                      <p className="text-sm font-bold text-indigo-400">
                        {projectData?.reviewer?.full_name || <span className="text-slate-500 italic">Đang phân bổ...</span>}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-500">Điểm phản biện</span>
                      <p className="text-2xl font-extrabold text-indigo-400">
                        {projectData?.reviewer_score !== null && projectData?.reviewer_score !== undefined
                          ? Number(projectData.reviewer_score).toFixed(1)
                          : '-'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-400">Kết luận phản biện:</span>
                    <span className="font-semibold text-slate-200">
                      {projectData?.reviewer_verdict_display || (projectData?.reviewer_score !== null ? 'Cho phép bảo vệ' : 'Chờ đánh giá')}
                    </span>
                  </div>
                  {projectData?.reviewer_feedback && (
                    <p className="text-xs text-slate-300 bg-slate-900/70 p-2.5 rounded-lg border border-slate-800 italic">
                      "{projectData.reviewer_feedback}"
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Final Grade Summary Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
              <div>
                <h4 className="text-base font-bold text-slate-100 flex items-center gap-2">
                  <span>🏆</span> Bảng Điểm Tổng Kết Đồ Án Tốt Nghiệp
                </h4>
                <p className="text-xs text-slate-400">
                  Tính toán tự động theo Quy chế tín chỉ UTC (40% GVHD + 20% GVPB + 40% Hội đồng)
                </p>
              </div>

              {projectData?.final_grade ? (
                <div className="space-y-5">
                  {/* 3 Component Scores */}
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                      <span className="text-xs text-slate-400 font-medium">Điểm GVHD (40%)</span>
                      <p className="text-2xl font-extrabold text-emerald-400 mt-1">
                        {projectData.final_grade.supervisor_score !== null ? Number(projectData.final_grade.supervisor_score).toFixed(1) : '-'}
                      </p>
                    </div>
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                      <span className="text-xs text-slate-400 font-medium">Điểm GVPB (20%)</span>
                      <p className="text-2xl font-extrabold text-indigo-400 mt-1">
                        {projectData.final_grade.reviewer_score !== null ? Number(projectData.final_grade.reviewer_score).toFixed(1) : '-'}
                      </p>
                    </div>
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                      <span className="text-xs text-slate-400 font-medium">Điểm Hội đồng (40%)</span>
                      <p className="text-2xl font-extrabold text-blue-400 mt-1">
                        {projectData.final_grade.council_avg_score !== null ? Number(projectData.final_grade.council_avg_score).toFixed(2) : '-'}
                      </p>
                    </div>
                  </div>

                  {/* Total Final Score Card */}
                  <div className="bg-gradient-to-r from-blue-900/40 via-indigo-900/30 to-slate-900 p-6 rounded-2xl border border-blue-500/30 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-blue-300 font-semibold uppercase tracking-wider">
                        Điểm Tổng kết cuối cùng
                      </span>
                      <div className="flex items-baseline gap-3 mt-1.5">
                        <span className="text-4xl font-black text-white">
                          {projectData.final_grade.final_score_10 !== null ? Number(projectData.final_grade.final_score_10).toFixed(2) : '-'}
                        </span>
                        <span className="text-base text-slate-300 font-medium">/ 10</span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1">
                        Quy đổi Thang 4: <b className="text-white font-bold">{projectData.final_grade.final_score_4 !== null ? Number(projectData.final_grade.final_score_4).toFixed(2) : '-'}</b>
                      </p>
                    </div>

                    <div className="text-right space-y-1">
                      <span className="text-3xl font-black text-amber-400">
                        {projectData.final_grade.final_letter_grade || '-'}
                      </span>
                      <p className="text-xs font-semibold text-slate-300">
                        Xếp loại: {projectData.final_grade.classification || 'Đang cập nhật'}
                      </p>
                      <div className="pt-1">
                        {projectData.final_grade.is_passed ? (
                          <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold">
                            ✓ ĐẠT YÊU CẦU
                          </span>
                        ) : (
                          <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-400 text-xs font-semibold">
                            Đang bảo vệ
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 rounded-xl bg-slate-950/60 border border-slate-800/80 text-slate-400 text-xs">
                  Chưa có dữ liệu điểm tổng kết cuối cùng. Điểm sẽ hiển thị sau khi Hội đồng hoàn tất phiên chấm và ký biên bản.
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Modal: Ghi chú & Nộp link kết quả nhiệm vụ của sinh viên */}
      {selectedTaskForNotes && (
        <div className="utc-modal-overlay">
          <div className="utc-modal-card" style={{ maxWidth: 480 }}>
            <div className="utc-modal-header">
              <div>
                <span className="text-xs text-blue-400 font-semibold">Cập nhật tiến độ nhiệm vụ</span>
                <h3 className="utc-modal-title mt-1">{selectedTaskForNotes.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTaskForNotes(null)}
                className="utc-modal-close-btn"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveStudentNotes} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Ghi chú kết quả, link Github Commit hoặc Drive tài liệu:
                </label>
                <textarea
                  rows={4}
                  value={studentNotesInput}
                  onChange={(e) => setStudentNotesInput(e.target.value)}
                  placeholder="Ví dụ: Đã hoàn thành các chức năng theo yêu cầu, link demo: https://... hoặc commit hash: abc1234"
                  className="utc-modal-textarea"
                />
              </div>

              <div className="utc-modal-footer">
                <button
                  type="button"
                  onClick={() => setSelectedTaskForNotes(null)}
                  className="utc-btn utc-btn-ghost"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={savingTaskNote}
                  className="utc-btn utc-btn-topic-save"
                >
                  <span>💾</span>
                  <span>{savingTaskNote ? 'Đang lưu...' : 'Lưu ghi chú'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Nộp sản phẩm / Deliverable cho nhiệm vụ */}
      {selectedTaskForDeliverable && (
        <div className="utc-modal-overlay">
          <div className="utc-modal-card">
            <div className="utc-modal-header">
              <div>
                <span className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">Giai đoạn 5: Nộp kết quả nhiệm vụ</span>
                <h3 className="utc-modal-title mt-1">{selectedTaskForDeliverable.title}</h3>
                <p className="utc-modal-subtitle">Nộp file sản phẩm, mã nguồn nén hoặc link repo Git để GVHD đánh giá.</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTaskForDeliverable(null)}
                className="utc-modal-close-btn"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitDeliverable} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Đính kèm File sản phẩm (Zip, PDF, Docs, tối đa 25MB):
                </label>
                <input
                  type="file"
                  onChange={(e) => setDeliverableFile(e.target.files?.[0] || null)}
                  className="w-full text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:bg-slate-800 file:text-slate-200"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Link sản phẩm trực tuyến (GitHub / GitLab / Google Drive / Demo Web):
                </label>
                <input
                  type="url"
                  value={deliverableUrl}
                  onChange={(e) => setDeliverableUrl(e.target.value)}
                  placeholder="https://github.com/username/project hoặc https://drive.google.com/..."
                  className="utc-modal-input"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Ghi chú tóm tắt kết quả gửi Giảng viên:
                </label>
                <textarea
                  rows={3}
                  value={deliverableNotes}
                  onChange={(e) => setDeliverableNotes(e.target.value)}
                  placeholder="Mô tả tóm tắt tính năng đã chạy, hướng dẫn cài đặt hoặc những điểm lưu ý..."
                  className="utc-modal-textarea"
                />
              </div>

              <div className="utc-modal-footer">
                <button
                  type="button"
                  onClick={() => setSelectedTaskForDeliverable(null)}
                  className="utc-btn utc-btn-ghost"
                >
                  Đóng
                </button>
                <button
                  type="submit"
                  disabled={submittingDeliverable}
                  className="utc-btn utc-btn-topic-approved"
                >
                  <span>📤</span>
                  <span>{submittingDeliverable ? 'Đang nộp...' : 'Nộp sản phẩm'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Đơn xin bảo lưu đồ án tốt nghiệp */}
      {showDeferralModal && (
        <div className="utc-modal-overlay">
          <div className="utc-modal-card">
            <div className="utc-modal-header">
              <div>
                <h3 className="utc-modal-title">
                  <span>📝</span> Đơn Xin Bảo Lưu Đồ Án Tốt Nghiệp
                </h3>
                <p className="utc-modal-subtitle">
                  Dành cho trường hợp chưa đủ điều kiện học vụ hoặc lý do chính đáng cần bảo lưu kết quả sang đợt tiếp theo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowDeferralModal(false)}
                className="utc-modal-close-btn"
                title="Đóng"
              >
                ✕
              </button>
            </div>

            {/* List of existing requests */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Lịch sử đơn đã nộp</h4>
              {deferralRequests.length === 0 ? (
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 text-xs text-center">
                  Bạn chưa gửi đơn xin bảo lưu nào trong đợt này.
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {deferralRequests.map((req) => (
                    <div key={req.id} className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200">
                          Lý do: {req.reason_category_display || req.reason_category}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          req.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' :
                          req.status === 'REJECTED' ? 'bg-rose-500/20 text-rose-400 border-rose-500/40' :
                          'bg-amber-500/20 text-amber-400 border-amber-500/40'
                        }`}>
                          {req.status_display || req.status}
                        </span>
                      </div>
                      <p className="text-slate-300 whitespace-pre-line">{req.reason_details}</p>
                      {req.evidence_file && (
                        <p>
                          <a href={req.evidence_file} target="_blank" rel="noreferrer" className="text-blue-400 underline font-medium hover:text-blue-300">
                            Xem minh chứng đính kèm ↗
                          </a>
                        </p>
                      )}
                      {req.faculty_review_notes && (
                        <div className="p-2 rounded bg-slate-900 border border-slate-800 text-slate-300">
                          <span className="font-semibold text-amber-400">Ý kiến Khoa:</span> {req.faculty_review_notes}
                        </div>
                      )}
                      <div className="text-[10px] text-slate-500">
                        Nộp lúc: {new Date(req.created_at).toLocaleString('vi-VN')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Form to submit new request */}
            <form onSubmit={handleSubmitDeferral} className="space-y-3 pt-3 border-t border-slate-800 text-xs">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Nộp đơn xin bảo lưu mới</h4>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Phân loại lý do (*)</label>
                <select
                  value={deferralReasonCategory}
                  onChange={(e) => setDeferralReasonCategory(e.target.value as any)}
                  className="utc-modal-select"
                >
                  <option value="ACADEMIC">Học vụ (Chưa hoàn thành đủ tín chỉ / nợ môn tiên quyết)</option>
                  <option value="HEALTH">Sức khỏe (Có chứng nhận y tế / điều trị)</option>
                  <option value="FINANCIAL">Tài chính (Hoàn cảnh gia đình khó khăn)</option>
                  <option value="PERSONAL">Cá nhân khác (Công tác đột xuất, lý do gia đình)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Chi tiết lý do & Đề xuất (*)</label>
                <textarea
                  rows={3}
                  required
                  value={deferralReasonDetails}
                  onChange={(e) => setDeferralReasonDetails(e.target.value)}
                  placeholder="Trình bày chi tiết lý do và mong muốn được bảo lưu đề tài/kết quả sang đợt tiếp theo..."
                  className="utc-modal-textarea"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">File minh chứng đính kèm (Giấy tờ y tế / xác nhận, PDF/Ảnh):</label>
                <input
                  type="file"
                  onChange={(e) => setDeferralEvidenceFile(e.target.files?.[0] || null)}
                  className="w-full text-slate-400 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-[11px] file:bg-slate-800 file:text-slate-200"
                />
              </div>

              <div className="utc-modal-footer">
                <button
                  type="button"
                  onClick={() => setShowDeferralModal(false)}
                  className="utc-btn utc-btn-ghost"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={submittingDeferral}
                  className="utc-btn utc-btn-deferral-submit"
                >
                  <span>{submittingDeferral ? '⏳' : '📨'}</span>
                  <span>{submittingDeferral ? 'Đang gửi...' : 'Gửi đơn bảo lưu'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
