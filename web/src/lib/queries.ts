import { useQuery } from '@tanstack/react-query';
import type {
  AnnouncementDTO,
  DashboardDTO,
  FamilyDTO,
  LocationDTO,
  MessageDTO,
  NotificationDTO,
  OrderDTO,
  PublicInfoDTO,
  RunDTO,
  ServiceDTO,
  ThreadDTO,
} from '@cds/shared';
import { get, qs } from './api';

export const usePublicInfo = () =>
  useQuery({ queryKey: ['public-info'], queryFn: () => get<PublicInfoDTO>('/public/info'), staleTime: 5 * 60_000 });

export interface OrderQuery {
  scope?: 'active' | 'history' | 'today' | 'upcoming' | 'all';
  status?: string;
  date?: string;
  from?: string;
  to?: string;
  q?: string;
  assigned?: string;
  payment?: string;
  runId?: number;
  cadetId?: number;
  limit?: number;
}

export const useOrders = (params: OrderQuery, enabled = true) =>
  useQuery({ queryKey: ['orders', params], queryFn: () => get<OrderDTO[]>(`/orders${qs({ ...params })}`), enabled });

export const useOrder = (id: number) => useQuery({ queryKey: ['order', id], queryFn: () => get<OrderDTO>(`/orders/${id}`), enabled: id > 0 });

export const useServices = (all = false) =>
  useQuery({ queryKey: ['services', all], queryFn: () => get<ServiceDTO[]>(`/services${all ? '?all=1' : ''}`), staleTime: 60_000 });

export const useLocations = (all = false) =>
  useQuery({ queryKey: ['locations', all], queryFn: () => get<LocationDTO[]>(`/locations${all ? '?all=1' : ''}`), staleTime: 60_000 });

export const useRuns = (all = false) => useQuery({ queryKey: ['runs', all], queryFn: () => get<RunDTO[]>(`/runs${all ? '?all=1' : ''}`) });

export const useFamily = (enabled = true) => useQuery({ queryKey: ['family'], queryFn: () => get<FamilyDTO>('/family'), enabled });

export const useThreads = (enabled = true) => useQuery({ queryKey: ['threads'], queryFn: () => get<ThreadDTO[]>('/threads'), enabled });

export const useThread = (id: number) =>
  useQuery({ queryKey: ['thread', id], queryFn: () => get<{ thread: ThreadDTO; messages: MessageDTO[] }>(`/threads/${id}`), enabled: id > 0 });

export const useNotifications = () => useQuery({ queryKey: ['notifications'], queryFn: () => get<NotificationDTO[]>('/me/notifications') });

export const useBadges = (enabled: boolean) =>
  useQuery({ queryKey: ['badges'], queryFn: () => get<{ notifications: number }>('/me/badges'), enabled, refetchInterval: 120_000 });

export const useAnnouncements = () => useQuery({ queryKey: ['announcements'], queryFn: () => get<AnnouncementDTO[]>('/announcements') });

export const useDashboard = (enabled = true) =>
  useQuery({ queryKey: ['dashboard'], queryFn: () => get<DashboardDTO>('/staff/dashboard'), enabled, refetchInterval: 60_000 });

export interface TeamMember {
  id: number;
  firstName: string;
  lastName: string;
  role: 'organizer' | 'helper';
  phone: string | null;
}
export const useStaffTeam = (enabled = true) =>
  useQuery({ queryKey: ['staff-team'], queryFn: () => get<TeamMember[]>('/staff/team'), enabled, staleTime: 60_000 });

export interface CustomerInfo {
  payments: { methods: { id: string; label: string; url: string; details: string; enabled: boolean }[]; allowTips: boolean; instructions: string };
  contact: { ownerName: string; phone: string; email: string; packageAddress: string };
}
export const useCustomerInfo = () => useQuery({ queryKey: ['customer-info'], queryFn: () => get<CustomerInfo>('/customer-info'), staleTime: 5 * 60_000 });
