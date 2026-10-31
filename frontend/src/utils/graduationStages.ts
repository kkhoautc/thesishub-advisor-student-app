// UTC FYP 6-Stage Workflow Definitions & Stage Determination

export type GraduationStageKey = 'project' | 'survey' | 'outline' | 'weekly' | 'supervision' | 'grade';

export interface StageInfo {
  number: number;
  key: GraduationStageKey;
  label: string;
  sidebarLabel: string;
  shortLabel: string;
  icon: string;
  description: string;
}

export const GRADUATION_STAGES: StageInfo[] = [
  {
    number: 1,
    key: 'project',
    label: 'GĐ 1: Khởi Tạo Đợt & Phân Công GVHD',
    sidebarLabel: 'GĐ 1: Đợt & Phân Công GVHD',
    shortLabel: '1. Đợt & Phân công',
    icon: '🎓',
    description: 'Admin tạo đợt, import SV, chọn hướng NC, đăng ký 3 NV và chốt phân công',
  },
  {
    number: 2,
    key: 'outline',
    label: 'GĐ 2: Chọn Đề Tài & Đề Cương Theo Mẫu',
    sidebarLabel: 'GĐ 2: Đề Tài & Đề Cương Mẫu',
    shortLabel: '2. Đề tài & Đề cương',
    icon: '📄',
    description: 'SV đăng ký đề tài, GVHD thẩm định duyệt, điền Template sinh PDF đề cương',
  },
  {
    number: 3,
    key: 'supervision',
    label: 'GĐ 3: Thực Hiện Đồ Án & Điểm Quá Trình',
    sidebarLabel: 'GĐ 3: Thực Hiện & Điểm Quá Trình',
    shortLabel: '3. Thực hiện đồ án',
    icon: '📋',
    description: 'GVHD giao task & deadline, SV nộp bài, GVHD đánh giá và chấm Điểm quá trình',
  },
  {
    number: 4,
    key: 'survey',
    label: 'GĐ 4: Hậu Kiểm Điều Kiện Học Vụ',
    sidebarLabel: 'GĐ 4: Hậu Kiểm Học Vụ (Nợ 0 TC)',
    shortLabel: '4. Hậu kiểm học vụ',
    icon: '⚖️',
    description: 'Giáo vụ kiểm tra nợ tín chỉ: Nợ > 0 TC bảo lưu, Nợ = 0 TC đủ điều kiện bảo vệ',
  },
  {
    number: 5,
    key: 'weekly',
    label: 'GĐ 5: Hội Đồng & Sắp Xếp Lịch Bảo Vệ',
    sidebarLabel: 'GĐ 5: Hội Đồng & Lịch Bảo Vệ',
    shortLabel: '5. Hội đồng & Lịch BV',
    icon: '🏛️',
    description: 'Thành lập hội đồng 5 thành viên và hệ thống tự động sắp xếp lịch bảo vệ chi tiết',
  },
  {
    number: 6,
    key: 'grade',
    label: 'GĐ 6: Chấm Điểm Bảo Vệ, Biên Bản & Bế Mạc',
    sidebarLabel: 'GĐ 6: Chấm BV, Biên Bản & Bế Mạc',
    shortLabel: '6. Chấm điểm & Bế mạc',
    icon: '🏆',
    description: '5 thành viên HĐ chấm độc lập, xuất PDF biên bản có chữ ký và tổng kết đợt',
  },
];

/**
 * Tính toán giai đoạn hiện tại (1 -> 6) của Sinh viên / Đồ án theo chuẩn yeucau.md
 */
export function getProjectStageNumber(project: any): number {
  if (!project) return 1;

  const finalGrade = project.final_grade || project.final_grade_summary || null;

  // Giai đoạn 6: Đang bảo vệ, đã chấm điểm HĐ hoặc đã hoàn tất/kết thúc
  if (
    project.status === 'PASSED' ||
    project.status === 'FAILED' ||
    project.status === 'DEFENDING' ||
    project.status === 'DEFENDED' ||
    finalGrade?.is_finalized ||
    (finalGrade?.council_avg_score !== null && finalGrade?.council_avg_score !== undefined && finalGrade?.council_avg_score > 0)
  ) {
    return 6;
  }

  // Giai đoạn 5: Đã thành lập Hội đồng hoặc xếp lịch bảo vệ chi tiết
  if (
    project.schedule_slot ||
    Boolean(project.council_name) ||
    Boolean(project.council) ||
    project.status === 'DEFENSE_READY'
  ) {
    return 5;
  }

  // Giai đoạn 4: GVHD đã xác nhận hoàn thành & chấm điểm quá trình (GĐ 3 xong)
  // Chuyển sang GĐ 4: Chờ Giáo vụ hậu kiểm nợ đọng tín chỉ (Nợ > 0 TC: Bảo lưu, Nợ = 0 TC: Đủ ĐK)
  if (
    project.supervisor_defense_confirmed ||
    (project.supervisor_score !== null && project.supervisor_score !== undefined && project.supervisor_score !== '')
  ) {
    return 4;
  }

  // Giai đoạn 3: Đề cương đã duyệt -> Đang thực hiện đồ án (Tasks & Deadline)
  if (
    project.status === 'OUTLINE_APPROVED' ||
    project.status === 'IN_PROGRESS' ||
    project.outline_review?.verdict === 'APPROVED'
  ) {
    return 3;
  }

  // Giai đoạn 2: Đã có GVHD, đang xây dựng đề tài / nộp đề cương theo mẫu
  if (
    project.status === 'TOPIC_CONFIRMED' ||
    project.status === 'TOPIC_APPROVED' ||
    project.status === 'OUTLINE_PENDING' ||
    project.status === 'OUTLINE_REVISION' ||
    project.topic_title_vi
  ) {
    return 2;
  }

  // Giai đoạn 1: Mới phân công GVHD ban đầu
  return 1;
}

export function getProjectStageInfo(project: any): StageInfo {
  const num = getProjectStageNumber(project);
  return GRADUATION_STAGES.find((s) => s.number === num) || GRADUATION_STAGES[0];
}

/**
 * Tính số lượng sinh viên ở mỗi giai đoạn (1 -> 6) cho Bảng điều khiển của Giảng viên
 */
export function calculateStageCounts(projects: any[]): Record<number, number> {
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  if (!Array.isArray(projects)) return counts;
  projects.forEach((p) => {
    const stage = getProjectStageNumber(p);
    if (stage >= 1 && stage <= 6) {
      counts[stage] = (counts[stage] || 0) + 1;
    }
  });
  return counts;
}
