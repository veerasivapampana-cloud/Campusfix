import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { Activity, AlertTriangle, Award, Bell, Building2, Camera, Check, CheckCircle2, ChevronRight, Clock3, ClipboardList, Flame, Hammer, Home, Leaf, MapPin, Menu, Plus, Search, Shield, Sparkles, Users, Wrench, X } from 'lucide-react';
import {
  getGetCampusAnalyticsQueryKey, getGetCampusCreditsQueryKey, getGetCampusIssueTimelineQueryKey,
  getGetCampusOverviewQueryKey, getListCampusIssuesQueryKey, getListCampusNotificationsQueryKey,
  getListCampusUsersQueryKey, useAnalyzeCampusIssue, useAssignCampusIssue, useCreateCampusIssue,
  useGetCampusAnalytics, useGetCampusCredits, useGetCampusIssueTimeline, useGetCampusOverview,
  useHealthCheck, useListCampusIssues, useListCampusNotifications, useListCampusUsers,
  useMarkCampusNotificationRead, useUpdateCampusIssueStatus,
} from '@workspace/api-client-react';
import type { CampusAnalytics, CampusIssue, CampusNotification, CampusOverview, CampusUser, CreditProfile, IssueAnalysis, IssueTimelineEntry } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import './index.css';

const queryClient = new QueryClient();
type Role = 'student' | 'admin' | 'staff';
type Issue = CampusIssue;
const navLinks = [
  { href: '/', label: 'Overview', icon: Home, group: 'Workspace', roles: ['admin', 'staff'] },
  { href: '/report', label: 'Report an issue', icon: Plus, group: 'Workspace', roles: ['student'] },
  { href: '/issues', label: 'My issues', icon: ClipboardList, group: 'Workspace', roles: ['student'] },
  { href: '/admin', label: 'Triage console', icon: Shield, group: 'Operations', roles: ['admin'] },
  { href: '/staff', label: 'Assigned work', icon: Wrench, group: 'Operations', roles: ['staff'] },
  { href: '/analytics', label: 'Campus analytics', icon: Activity, group: 'Insights', roles: ['admin', 'staff'] },
  { href: '/credits', label: 'My credits', icon: Award, group: 'Community', roles: ['student'] },
  { href: '/notifications', label: 'Notifications', icon: Bell, group: 'Community', roles: ['student', 'admin', 'staff'] },
] as const;

function AppShell() {
  const [path] = useLocation();
  const [role, setRole] = useState<Role>(() => (localStorage.getItem('campusfix-role') as Role) || 'student');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All statuses');
  const [expanded, setExpanded] = useState<number | null>(null);
  const usersQuery = useListCampusUsers<CampusUser[]>({ query: { queryKey: getListCampusUsersQueryKey() } });
  const issueQuery = useListCampusIssues<CampusIssue[]>({ query: { queryKey: getListCampusIssuesQueryKey() } });
  const overviewQuery = useGetCampusOverview<CampusOverview>({ query: { queryKey: getGetCampusOverviewQueryKey() } });
  const analyticsQuery = useGetCampusAnalytics<CampusAnalytics>({ query: { queryKey: getGetCampusAnalyticsQueryKey() } });
  const users = usersQuery.data ?? [];
  const user = users.find((person) => person.role === role) ?? users[0];
  const userId = user?.id ?? 1;
  const creditsQuery = useGetCampusCredits<CreditProfile>(userId, { query: { queryKey: getGetCampusCreditsQueryKey(userId) } });
  const notificationQuery = useListCampusNotifications<CampusNotification[]>(userId, { query: { queryKey: getListCampusNotificationsQueryKey(userId) } });
  const healthQuery = useHealthCheck();
  const createIssue = useCreateCampusIssue();
  const analyzeIssue = useAnalyzeCampusIssue();
  const assignIssue = useAssignCampusIssue();
  const updateIssue = useUpdateCampusIssueStatus();
  const markRead = useMarkCampusNotificationRead();
  const qc = useQueryClient();
  const [analysis, setAnalysis] = useState<IssueAnalysis | null>(null);
  const [submittedTicket, setSubmittedTicket] = useState<string | null>(null);
  const [form, setForm] = useState(() => ({ title: '', description: '', location: new URLSearchParams(window.location.search).get('location') ?? '', imageUrl: '' }));
  const [photoPreview, setPhotoPreview] = useState('');
  const [assignFor, setAssignFor] = useState<number | null>(null);
  const [assignStaff, setAssignStaff] = useState('');
  const [assignDepartment, setAssignDepartment] = useState('');
  const [notifySupporting, setNotifySupporting] = useState(true);
  const [workNote, setWorkNote] = useState('');
  const [demoBusy, setDemoBusy] = useState(false);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  };
  const switchRole = (next: Role) => {
    setRole(next);
    localStorage.setItem('campusfix-role', next);
    setExpanded(null);
    setMobileOpen(false);
  };
  const invalidateOperations = () => {
    void qc.invalidateQueries({ queryKey: getListCampusIssuesQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetCampusOverviewQueryKey() });
    void qc.invalidateQueries({ queryKey: getGetCampusAnalyticsQueryKey() });
  };
  const activeNav = navLinks.filter((item) => item.roles.some((itemRole) => itemRole === role));
  const notifications = notificationQuery.data ?? [];
  const unreadCount = notifications.filter((notification) => !notification.read).length;
  const issues = issueQuery.data ?? [];
  const filteredIssues = useMemo(() => issues.filter((issue) => {
    const matchRole = role !== 'student' || issue.reporterId === userId;
    const matchText = `${issue.ticketId} ${issue.title} ${issue.location}`.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filter === 'All statuses' || issue.status === filter;
    return matchRole && matchText && matchStatus;
  }), [issues, role, userId, search, filter]);
  const staffUsers = users.filter((person) => person.role === 'staff');
  useEffect(() => {
    if (path === '/report') {
      const locationParam = new URLSearchParams(window.location.search).get('location');
      if (locationParam) setForm((current) => ({ ...current, location: locationParam }));
    }
  }, [path]);
  useEffect(() => {
    if (!photoPreview) return;
    return () => URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const runAnalysis = async (description = form.description, location = form.location) => {
    if (!description.trim() || !location.trim()) {
      flash('Add a description and campus location to analyze.');
      return;
    }
    try {
      const result = await analyzeIssue.mutateAsync({ data: { description, location } });
      setAnalysis(result);
    } catch {
      flash('Analysis could not be completed. Check your connection and retry.');
    }
  };
  const runAnalysisRef = useRef(runAnalysis);
  runAnalysisRef.current = runAnalysis;
  useEffect(() => {
    setAnalysis(null);
    if (form.description.trim().length < 8 || !form.location.trim()) return;
    const timer = window.setTimeout(() => void runAnalysisRef.current(form.description, form.location), 700);
    return () => window.clearTimeout(timer);
  }, [form.description, form.location]);

  const submitReport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.description.trim() || !form.location.trim()) return;
    createIssue.mutate({
      data: {
        title: form.title.trim() || form.description.trim().slice(0, 62),
        description: form.description.trim(),
        location: form.location.trim(),
        reporterId: userId,
        imageUrl: form.imageUrl.trim() || null,
      },
    }, {
      onSuccess: (issue) => {
        setSubmittedTicket(issue.ticketId);
        setForm({ title: '', description: '', location: '', imageUrl: '' });
        setPhotoPreview('');
        setAnalysis(null);
        invalidateOperations();
        void qc.invalidateQueries({ queryKey: getGetCampusCreditsQueryKey(userId) });
        flash('Issue submitted. Your report is now in the campus queue.');
      },
      onError: () => flash('We could not submit this report. Please try again.'),
    });
  };
  const runDemo = async () => {
    setDemoBusy(true);
    setSubmittedTicket(null);
    const scenario = {
      title: 'Electrical hazard beside water leak',
      description: 'There is exposed electrical wiring beside an active water leak in Block A, Room 204. Water is spreading across the floor near the outlet, creating an immediate shock and slip hazard.',
      location: 'Block A, Room 204',
    };
    setForm({ ...scenario, imageUrl: '' });
    setPhotoPreview('');
    try {
      const result = await analyzeIssue.mutateAsync({ data: { description: scenario.description, location: scenario.location } });
      setAnalysis(result);
      flash('Scenario loaded with live campus analysis.');
    } catch {
      setAnalysis(null);
      flash('Demo text loaded. Analysis is unavailable right now.');
    } finally { setDemoBusy(false); }
  };
  const assign = (issue: Issue) => {
    if (!assignStaff) { flash('Choose a maintenance teammate first.'); return; }
    const member = staffUsers.find((person) => person.id === Number(assignStaff));
    if (!member) return;
    assignIssue.mutate({ issueId: issue.id, data: { staffId: member.id, primaryDepartment: assignDepartment || issue.primaryDepartment, supportingDepartments: issue.supportingDepartments, notifySupporting } }, {
      onSuccess: () => { setAssignFor(null); setAssignStaff(''); invalidateOperations(); flash(`Assigned to ${member.name}.`); },
      onError: () => flash('Assignment failed. Please retry.'),
    });
  };
  const openAssignment = (issue: Issue) => {
    setAssignFor(issue.id);
    setAssignStaff(issue.assignedStaffId ? String(issue.assignedStaffId) : '');
    setAssignDepartment(issue.primaryDepartment);
    setNotifySupporting(true);
    setExpanded(issue.id);
  };
  const updateStatus = (issueId: number, status: 'In Progress' | 'Resolved' | 'Verified', note: string) => {
    updateIssue.mutate({ issueId, data: { status, note, resolutionImageUrl: null } }, {
      onSuccess: (issue) => {
        setWorkNote('');
        invalidateOperations();
        if (status === 'Resolved' || status === 'Verified') {
          void qc.invalidateQueries({ queryKey: getGetCampusCreditsQueryKey(issue.reporterId) });
          void qc.invalidateQueries({ queryKey: getListCampusNotificationsQueryKey(issue.reporterId) });
        }
        flash(status === 'Resolved' ? 'Work resolved. The reporter was notified and awarded 10 credits.' : `Status updated to ${status}.`);
      },
      onError: () => flash('Status update failed. Please try again.'),
    });
  };
  const markNotificationRead = (notificationId: number) => {
    markRead.mutate({ notificationId }, {
      onSuccess: () => void qc.invalidateQueries({ queryKey: getListCampusNotificationsQueryKey(userId) }),
      onError: () => flash('Could not update notification.'),
    });
  };
  const timeline = (issue: Issue) => <IssueTimeline issueId={issue.id} />;

  const pageTitle = ({ '/': 'Campus operations', '/report': 'Report an issue', '/issues': 'My issues', '/admin': 'Triage console', '/staff': 'Assigned work', '/analytics': 'Campus analytics', '/credits': 'Campus credits', '/notifications': 'Notifications' } as Record<string, string>)[path] ?? 'CampusFix';
  const studentView = role === 'student';

  return (
    <div className="app-shell">
      <aside className="sidebar" data-testid="navigation-sidebar">
        <Link href="/" className="brand" data-testid="link-campusfix-home"><span className="brand-mark"><Shield size={20} /></span><span className="brand-name">Campus<span>Fix</span></span></Link>
        <div className="side-label">Campus workspace</div>
        <nav className="nav-list">
          {activeNav.map(({ href, label, icon: Icon, group }, index) => (
            <div key={href}>
              {(index === 0 || group !== activeNav[index - 1]?.group) && index > 0 && <div className="side-label" style={{ marginTop: 19 }}>{group}</div>}
              <Link href={href} className={`nav-item ${path === href ? 'active' : ''}`} data-testid={`link-nav-${href.replace('/', '') || 'home'}`}><span className="nav-icon"><Icon size={16} /></span>{label}{href === '/notifications' && unreadCount > 0 && <span style={{ marginLeft: 'auto', color: '#dfbd77', fontSize: 10 }}>{unreadCount}</span>}</Link>
            </div>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="campus-note"><b><MapPin size={11} style={{ verticalAlign: 'middle', marginRight: 5 }} /> Northbridge University</b>One campus. Shared responsibility. Keep our spaces safe, together.</div>
          <div className="nav-item" style={{ cursor: 'default', color: '#d4ded5' }}><span className="nav-icon"><span style={{ width: 8, height: 8, borderRadius: 99, background: healthQuery.data?.status === 'ok' ? '#91c49a' : '#dfbd77' }} /></span><span>{healthQuery.data?.status === 'ok' ? 'All systems operational' : 'CampusFix service'}</span></div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <button className="icon-btn mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen((open) => !open)} data-testid="button-mobile-menu"><Menu size={17} /></button>
          <div className="crumb"><span>Northbridge University</span><ChevronRight size={13} /><strong>{pageTitle}</strong></div>
          <div className="top-actions">
            <div className="role-control"><span>Demo view</span><select aria-label="Switch demo role" value={role} onChange={(event) => switchRole(event.target.value as Role)} data-testid="select-demo-role"><option value="student">Student</option><option value="admin">Administrator</option><option value="staff">Maintenance</option></select></div>
            <Link href="/notifications" className="icon-btn" aria-label="Notifications" data-testid="link-notifications"><Bell size={16} />{unreadCount > 0 && <span className="dot" />}</Link>
            <div className="icon-btn" aria-label={user?.name ?? 'Demo account'} style={{ background: '#e3e9de', fontSize: 10, fontWeight: 800 }}>{user?.name?.split(' ').map((name) => name[0]).join('') ?? 'CF'}</div>
          </div>
        </header>
        {mobileOpen && <div style={{ position: 'fixed', zIndex: 25, inset: '62px 0 auto', background: '#183d39', padding: 12, display: 'grid', gap: 4 }}>
          {activeNav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMobileOpen(false)} className="nav-item" data-testid={`mobile-link-${href.replace('/', '') || 'home'}`}><Icon size={16} />{label}</Link>)}
        </div>}
        <main className="content">
          <Switch>
            <Route path="/">
              {studentView ? <StudentHome user={user} issues={issues.filter((issue) => issue.reporterId === userId)} credits={creditsQuery.data?.balance ?? user?.creditsBalance} />
                : <OverviewPage overview={overviewQuery.data} issues={issues} loading={overviewQuery.isLoading} error={overviewQuery.error} onRetry={() => void overviewQuery.refetch()} onExpand={setExpanded} expanded={expanded} timeline={timeline} />}
            </Route>
            <Route path="/report">
              <ReportPage form={form} setForm={setForm} analysis={analysis} loading={analyzeIssue.isPending} photoPreview={photoPreview} setPhotoPreview={setPhotoPreview} onAnalyze={() => void runAnalysis()} onDemo={() => void runDemo()} demoBusy={demoBusy} onSubmit={submitReport} submitting={createIssue.isPending} submittedTicket={submittedTicket} onDismiss={() => setSubmittedTicket(null)} />
            </Route>
            <Route path="/issues">
              <IssuesPage issues={filteredIssues} loading={issueQuery.isLoading} error={issueQuery.error} search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} role={role} onRetry={() => void issueQuery.refetch()} expanded={expanded} onExpand={setExpanded} timeline={timeline} />
            </Route>
            <Route path="/admin">
              <AdminPage overview={overviewQuery.data} issues={issues} loading={issueQuery.isLoading} error={issueQuery.error} staff={staffUsers} assignFor={assignFor} setAssignFor={setAssignFor} assignStaff={assignStaff} setAssignStaff={setAssignStaff} assignDepartment={assignDepartment} setAssignDepartment={setAssignDepartment} notifySupporting={notifySupporting} setNotifySupporting={setNotifySupporting} onOpenAssign={openAssignment} onAssign={assign} assigning={assignIssue.isPending} onStatus={updateStatus} updating={updateIssue.isPending} onRetry={() => void issueQuery.refetch()} expanded={expanded} onExpand={setExpanded} timeline={timeline} />
            </Route>
            <Route path="/staff">
              <StaffPage issues={issues.filter((issue) => issue.assignedStaffId === userId || (!user && issue.assignedStaffId !== null))} loading={issueQuery.isLoading} error={issueQuery.error} note={workNote} setNote={setWorkNote} onStatus={updateStatus} updating={updateIssue.isPending} onRetry={() => void issueQuery.refetch()} expanded={expanded} onExpand={setExpanded} timeline={timeline} />
            </Route>
            <Route path="/analytics">
              <AnalyticsPage analytics={analyticsQuery.data} overview={overviewQuery.data} loading={analyticsQuery.isLoading} error={analyticsQuery.error} onRetry={() => void analyticsQuery.refetch()} />
            </Route>
            <Route path="/credits">
              <CreditsPage profile={creditsQuery.data} loading={creditsQuery.isLoading} error={creditsQuery.error} onRetry={() => void creditsQuery.refetch()} userName={user?.name ?? 'Student'} />
            </Route>
            <Route path="/notifications">
              <NotificationsPage notifications={notifications} loading={notificationQuery.isLoading} error={notificationQuery.error} onRetry={() => void notificationQuery.refetch()} onRead={markNotificationRead} busy={markRead.isPending} />
            </Route>
            <Route component={NotFound} />
          </Switch>
        </main>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {activeNav.slice(0, 5).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={path === href ? 'active' : ''} data-testid={`mobile-nav-${href.replace('/', '') || 'home'}`}><Icon /><span>{label.replace('Campus analytics', 'Insights').replace('Report an issue', 'Report').replace('Triage console', 'Triage').replace('Assigned work', 'Work').replace('Notifications', 'Inbox').replace('My issues', 'Issues')}</span></Link>)}
        </nav>
      </div>
      {toast && <div role="status" className="toast-message" data-testid="status-toast">{toast}</div>}
    </div>
  );
}

function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: ReactNode }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="subtitle">{subtitle}</p></div>{action}</div>;
}
function LoadingBlock() { return <div className="card panel" aria-label="Loading content" data-testid="status-loading">{[1, 2, 3].map((i) => <div className="skeleton" key={i} style={{ width: `${88 - i * 11}%` }} />)}</div>; }
function ErrorBlock({ onRetry }: { onRetry: () => void }) { return <div className="card empty-state" data-testid="status-error"><AlertTriangle size={22} /><strong>Campus data did not load</strong><p className="subtitle">The service may be busy. Your work is safe; try again in a moment.</p><button className="button" onClick={onRetry} data-testid="button-retry">Retry connection</button></div>; }
function EmptyBlock({ title = 'Nothing in this queue', text = 'New campus activity will appear here.' }: { title?: string; text?: string }) { return <div className="empty-state" data-testid="status-empty"><ClipboardList size={22} /><strong>{title}</strong><span>{text}</span></div>; }
function Stat({ label, value, note, icon: Icon }: { label: string; value: ReactNode; note: string; icon: typeof Activity }) { return <article className="card metric" data-testid={`metric-${label.toLowerCase().replaceAll(' ', '-')}`}><div className="metric-label"><Icon size={12} style={{ verticalAlign: 'middle', marginRight: 6 }} />{label}</div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></article>; }
function statusClass(status: string) { return status.replaceAll(' ', '-'); }
function Status({ value }: { value: string }) { return <span className={`status-pill ${statusClass(value)}`} data-testid={`status-issue-${statusClass(value).toLowerCase()}`}>{value}</span>; }
function Priority({ value }: { value: string }) { return <span className={`priority ${value}`}>{value} priority</span>; }
function IssueRows({ issues, onExpand, expanded, timeline }: { issues: Issue[]; onExpand: (id: number | null) => void; expanded: number | null; timeline: (issue: Issue) => ReactNode }) {
  if (!issues.length) return <EmptyBlock />;
  return <div>{issues.map((issue) => <div key={issue.id} data-testid={`row-issue-${issue.id}`}>
    <div className="issue-row">
      <span className="issue-code">{issue.ticketId}</span>
      <div><div className="issue-title">{issue.title}</div><div className="issue-details"><span><MapPin size={10} style={{ verticalAlign: 'middle' }} /> {issue.location}</span><span>{issue.primaryCategory}</span><span>{new Date(issue.createdAt).toLocaleDateString()}</span></div></div>
      <Status value={issue.status} />
    </div>
    <div style={{ display: 'flex', gap: 9, alignItems: 'center', padding: '0 0 11px 60px' }}><Priority value={issue.priority} /><button className="tiny-button" onClick={() => onExpand(expanded === issue.id ? null : issue.id)} data-testid={`button-details-${issue.id}`}>{expanded === issue.id ? 'Hide timeline' : 'View timeline'}</button></div>
    {expanded === issue.id && <div style={{ padding: '8px 0 12px 60px' }}>{timeline(issue)}</div>}
  </div>)}</div>;
}
function IssueTimeline({ issueId }: { issueId: number }) {
  const query = useGetCampusIssueTimeline(issueId, { query: { queryKey: getGetCampusIssueTimelineQueryKey(issueId) } });
  if (query.isLoading) return <div className="skeleton" />;
  if (query.error) return <small style={{ color: '#a14c3e' }}>Timeline temporarily unavailable.</small>;
  if (!query.data?.length) return <small style={{ color: '#87928a' }}>No timeline updates yet.</small>;
  return <div>{query.data.map((entry) => <div className="step-line" key={entry.id} data-testid={`timeline-entry-${entry.id}`}><span className="step-dot done" /><div><strong>{entry.status}</strong><small>{entry.note} · {entry.actorName} · {new Date(entry.timestamp).toLocaleString()}</small></div></div>)}</div>;
}

function StudentHome({ user, issues, credits }: { user?: { name: string }; issues: Issue[]; credits?: number }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const recent = [...issues].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
  return <>
    <PageHeader eyebrow="Student services / Northbridge" title="Fix problems. Improve campus." subtitle={`Welcome back, ${user?.name?.split(' ')[0] ?? 'there'}. Your reports help keep every corner of campus working.`} action={<Link href="/report" className="button primary" data-testid="button-report-issue"><Plus size={15} /> Report a problem</Link>} />
    <section className="card panel" style={{ background: '#214b43', color: '#f4f0df', marginBottom: 18, overflow: 'hidden', position: 'relative' }} data-testid="panel-campusfix-flow">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' }}><div><p className="eyebrow" style={{ color: '#dfbd77' }}>From your report to a safer campus</p><h2 style={{ color: '#f4f0df', font: '700 22px var(--app-font-serif)', marginBottom: 7 }}>One clear report moves the whole campus.</h2><p style={{ color: '#cedbd0', fontSize: 11, margin: 0 }}>Five steps. The right team. A verified fix.</p></div><Link className="button gold" href="/report" data-testid="button-report-from-home"><Plus size={14} /> Fix a problem</Link></div>
      <div className="flow-steps" style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 9, marginTop: 22 }}>
        {[['01', 'Report', 'Tell us where'], ['02', 'AI analysis', 'Safety + category'], ['03', 'Priority route', 'Right department'], ['04', 'Dispatch', 'Crew takes action'], ['05', 'Verify', 'Close the loop']].map(([number, title, caption]) => <div key={number} data-testid={`flow-step-${number}`} style={{ borderTop: '1px solid #668278', paddingTop: 9 }}><span style={{ display: 'block', font: '10px var(--app-font-mono)', color: '#dfbd77' }}>{number}</span><strong style={{ display: 'block', fontSize: 11, margin: '5px 0 2px' }}>{title}</strong><small style={{ color: '#b7c9bb', fontSize: 9 }}>{caption}</small></div>)}
      </div>
    </section>
    <div className="metric-grid"><Stat label="Open reports" value={issues.filter((item) => !['Resolved', 'Verified'].includes(item.status)).length} note="Issues you have submitted" icon={ClipboardList} /><Stat label="Campus credits" value={credits ?? '—'} note="Earned by improving campus" icon={Award} /><Stat label="Resolved" value={issues.filter((item) => item.status === 'Resolved' || item.status === 'Verified').length} note="Your reports made a difference" icon={CheckCircle2} /><Stat label="Latest update" value={recent[0]?.status ?? '—'} note={recent[0]?.ticketId ?? 'No reports yet'} icon={Clock3} /></div>
    <div className="dashboard-grid">
      <section className="card panel"><div className="panel-head"><h2 className="panel-title">Your recent reports</h2><Link href="/issues" className="tiny-button" data-testid="link-all-issues">All reports <ChevronRight size={12} /></Link></div><IssueRows issues={recent} onExpand={setExpanded} expanded={expanded} timeline={(issue) => <IssueTimeline issueId={issue.id} />} /></section>
      <aside className="card panel"><div className="panel-head"><h2 className="panel-title">Make campus better</h2><Leaf size={17} color="#8a9e6c" /></div><div className="callout">Small reports prevent bigger problems. Tell us what you see and the right campus team will take it from there.</div><div style={{ marginTop: 16 }}><Link className="button primary" href="/report" data-testid="button-start-report"><Plus size={14} /> Start a report</Link></div><div style={{ marginTop: 25, borderTop: '1px solid #eeece4', paddingTop: 17 }}><div className="panel-meta">CAMPUS DEMO LINKS</div><p className="subtitle" style={{ marginTop: 8, marginBottom: 10 }}>Open a location-specific example report.</p><div style={{ display: 'grid', gap: 7 }}><Link className="tiny-button" href="/report?location=Block-A" data-testid="link-demo-block-a"><MapPin size={11} /> Block A · Room 204</Link><Link className="tiny-button" href="/report?location=Hostel-B" data-testid="link-demo-hostel-b"><MapPin size={11} /> Hostel B</Link></div><div style={{ marginTop: 17, borderTop: '1px solid #eeece4', paddingTop: 14 }}><div className="panel-meta">REPORTING TIP</div><p className="subtitle" style={{ marginTop: 8 }}>Include the closest building entrance or room number. Clear locations help crews arrive faster.</p></div></div></aside>
    </div>
  </>;
}

function OverviewPage({ overview, issues, loading, error, onRetry, onExpand, expanded, timeline }: { overview?: CampusOverview; issues: Issue[]; loading: boolean; error: unknown; onRetry: () => void; onExpand: (id: number | null) => void; expanded: number | null; timeline: (issue: Issue) => ReactNode }) {
  const recent = [...issues].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  return <>
    <PageHeader eyebrow="Operations / live campus status" title="Campus operations" subtitle="A clear view of the work that keeps Northbridge moving." action={<Link href="/admin" className="button primary" data-testid="button-open-triage"><Shield size={15} /> Open triage</Link>} />
    {loading ? <LoadingBlock /> : error ? <ErrorBlock onRetry={onRetry} /> : <>
      <div className="metric-grid"><Stat label="All reports" value={overview?.totalIssues ?? '—'} note="Campus-wide, all time" icon={ClipboardList} /><Stat label="Active P1" value={overview?.activeP1 ?? '—'} note="Immediate attention required" icon={AlertTriangle} /><Stat label="Unassigned" value={overview?.unassigned ?? '—'} note="Awaiting team ownership" icon={Users} /><Stat label="Resolved rate" value={overview ? `${overview.resolutionRate}%` : '—'} note={`${overview?.averageTriageMinutes ?? '—'} min average triage`} icon={CheckCircle2} /></div>
      <div className="dashboard-grid"><section className="card panel"><div className="panel-head"><h2 className="panel-title">Latest campus activity</h2><span className="panel-meta">LIVE QUEUE</span></div><IssueRows issues={recent} onExpand={onExpand} expanded={expanded} timeline={timeline} /></section><aside className="card panel"><div className="panel-head"><h2 className="panel-title">Campus pulse</h2><Activity size={16} color="#728e76" /></div><div className="metric-label">HOTSPOT OF THE DAY</div><div style={{ font: '700 21px var(--app-font-serif)', color: '#264940', margin: '9px 0 16px' }} data-testid="text-hotspot">{overview?.hotspotOfDay ?? 'No hotspot flagged'}</div><div className="callout">Triage time matters. Reports with a safety risk should be assigned before routine facility requests.</div><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18, borderTop: '1px solid #eeece4', paddingTop: 14 }}><span className="panel-meta">AVERAGE TRIAGE</span><strong style={{ color: '#33594e', fontSize: 13 }}>{overview?.averageTriageMinutes ?? '—'} min</strong></div></aside></div>
    </>}
  </>;
}

function ReportPage({ form, setForm, analysis, loading, photoPreview, setPhotoPreview, onAnalyze, onDemo, demoBusy, onSubmit, submitting, submittedTicket, onDismiss }: { form: { title: string; description: string; location: string; imageUrl: string }; setForm: (form: { title: string; description: string; location: string; imageUrl: string }) => void; analysis: IssueAnalysis | null; loading: boolean; photoPreview: string; setPhotoPreview: (url: string) => void; onAnalyze: () => void; onDemo: () => void; demoBusy: boolean; onSubmit: (event: FormEvent<HTMLFormElement>) => void; submitting: boolean; submittedTicket: string | null; onDismiss: () => void }) {
  const setField = (key: keyof typeof form, value: string) => setForm({ ...form, [key]: value });
  return <>
    <PageHeader eyebrow="Student services / Tell us what you see" title="Report a campus issue" subtitle="A precise report gets to the right team sooner. Safety concerns are prioritized automatically." action={<button className="button" onClick={onDemo} disabled={demoBusy} data-testid="button-demo-scenario"><Sparkles size={14} /> {demoBusy ? 'Loading scenario…' : 'Load Demo Scenario'}</button>} />
    {submittedTicket && <div className="callout" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }} data-testid="status-report-submitted"><span><CheckCircle2 size={16} style={{ verticalAlign: 'middle', marginRight: 7 }} /> Report received — ticket <b>{submittedTicket}</b>. <b>+15 campus credits</b> added. You can now track your fix.</span><Link href="/issues" className="tiny-button" data-testid="link-track-submitted">Track issue <ChevronRight size={12} /></Link><button className="tiny-button" onClick={onDismiss} data-testid="button-dismiss-success"><X size={12} /></button></div>}
    <div className="form-grid"><form className="card panel" onSubmit={onSubmit} data-testid="form-submit-report">
      <div className="panel-head"><h2 className="panel-title">Issue details</h2><span className="panel-meta">STEP 1 OF 2</span></div>
      <div className="field-group"><label className="form-label" htmlFor="report-title">Short title <span style={{ color: '#9ba49b', fontWeight: 400 }}>· optional</span></label><input id="report-title" className="form-field" value={form.title} onChange={(event) => setField('title', event.target.value)} placeholder="e.g. Broken light outside East Hall" data-testid="input-report-title" /></div>
      <div className="field-group"><label className="form-label" htmlFor="report-location">Where is the problem? <span style={{ color: '#b3483c' }}>*</span></label><input required id="report-location" className="form-field" value={form.location} onChange={(event) => setField('location', event.target.value)} placeholder="Building, floor, room or nearest entrance" data-testid="input-report-location" /></div>
      <div className="field-group"><label className="form-label" htmlFor="report-description">Describe what happened <span style={{ color: '#b3483c' }}>*</span></label><textarea required minLength={8} id="report-description" className="form-field" value={form.description} onChange={(event) => setField('description', event.target.value)} placeholder="What did you notice? Is anyone at risk? When did it begin?" data-testid="input-report-description" /></div>
      <div className="field-group"><label className="form-label" htmlFor="report-image">Photo evidence <span style={{ color: '#9ba49b', fontWeight: 400 }}>· optional, preview stays on this device</span></label><label className="button" htmlFor="report-image" style={{ width: '100%', justifyContent: 'flex-start' }} data-testid="button-add-report-photo"><Camera size={14} /> Take a photo or choose an image</label><input id="report-image" type="file" accept="image/*" capture="environment" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} onChange={(event) => { const file = event.target.files?.[0]; if (file) setPhotoPreview(URL.createObjectURL(file)); }} data-testid="input-report-photo" />{photoPreview && <div style={{ marginTop: 10, position: 'relative', width: 'min(100%, 260px)' }}><img src={photoPreview} alt="Local issue photo preview" style={{ display: 'block', maxWidth: '100%', maxHeight: 180, borderRadius: 8, objectFit: 'cover' }} data-testid="img-report-photo-preview" /><button type="button" className="tiny-button" style={{ position: 'absolute', top: 6, right: 6 }} onClick={() => setPhotoPreview('')} data-testid="button-remove-report-photo" aria-label="Remove photo preview"><X size={12} /></button></div>}<input aria-label="Optional image URL" className="form-field" style={{ marginTop: 10 }} value={form.imageUrl} onChange={(event) => setField('imageUrl', event.target.value)} placeholder="Or add a hosted image link" data-testid="input-report-image-url" /></div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'space-between', borderTop: '1px solid #eeece4', paddingTop: 16 }}><button type="button" className="button" onClick={onAnalyze} disabled={loading || !form.description.trim() || !form.location.trim()} data-testid="button-analyze-issue"><Sparkles size={14} /> {loading ? 'Checking risk…' : 'Analyze safety & route'}</button><button className="button primary" disabled={submitting} type="submit" data-testid="button-submit-issue">{submitting ? 'Submitting report…' : 'Submit report'} <ChevronRight size={14} /></button></div>
    </form>
    <aside className="card panel analysis-panel"><div className="panel-head"><h2 className="panel-title">Live issue analysis</h2><span className="panel-meta" style={{ color: loading ? '#a17e35' : '#839087' }}>{loading ? 'PROCESSING' : analysis ? 'READY' : 'AWAITING INPUT'}</span></div>
      {loading ? <div data-testid="status-analysis-loading"><div className="skeleton" /><div className="skeleton" style={{ width: '73%' }} /><div className="skeleton" style={{ width: '54%' }} /></div> : analysis ? <div data-testid="panel-analysis-result"><div className="analysis-score"><div><span>Priority score</span><strong style={{ display: 'block' }}>{analysis.priorityScore}<small style={{ font: '11px var(--app-font-mono)', color: '#78857e' }}> / 100</small></strong></div><Priority value={analysis.priority} /></div><div className="metric-label">SUGGESTED ROUTE</div><p style={{ color: '#34584d', fontSize: 13, fontWeight: 700, margin: '8px 0 4px' }}>{analysis.primaryDepartment}</p><p className="subtitle" style={{ fontSize: 11 }}>{analysis.primaryCategory}{analysis.secondaryCategory ? ` · ${analysis.secondaryCategory}` : ''} · {analysis.severity} severity</p><div className="callout" style={{ marginTop: 14 }}>{analysis.suggestedAction}</div><p className="subtitle" style={{ fontSize: 11, marginTop: 14 }}>{analysis.aiSummary}</p>{analysis.aiReasoning?.length > 0 && <ul className="reason-list">{analysis.aiReasoning.map((reason: string, index: number) => <li key={index}>{reason}</li>)}</ul>}<div style={{ marginTop: 15 }}><span className="metric-label">SAFETY ASSESSMENT</span><p style={{ margin: '6px 0 0', fontSize: 11, color: '#4d6559' }}>{analysis.safetyRisk}</p></div></div> : <div className="analysis-empty"><Sparkles size={24} style={{ marginBottom: 10, color: '#9f9b76' }} /><div>Analysis identifies urgency, safety risk and the best-fit facilities team.</div><div style={{ marginTop: 12, fontSize: 10 }}>Add a location and description, then run the check.</div></div>}
      <div style={{ borderTop: '1px solid #eeece4', paddingTop: 14, marginTop: 15 }}><div className="panel-meta">NEED IMMEDIATE HELP?</div><p className="subtitle" style={{ fontSize: 11, marginTop: 6 }}>For immediate danger, contact campus security or emergency services directly. This form is not an emergency line.</p></div>
    </aside></div>
  </>;
}

function IssuesPage({ issues, loading, error, search, setSearch, filter, setFilter, role, onRetry, expanded, onExpand, timeline }: { issues: Issue[]; loading: boolean; error: unknown; search: string; setSearch: (value: string) => void; filter: string; setFilter: (value: string) => void; role: Role; onRetry: () => void; expanded: number | null; onExpand: (id: number | null) => void; timeline: (issue: Issue) => ReactNode }) {
  const filters = ['All statuses', 'Reported', 'AI Analyzed', 'Assigned', 'In Progress', 'Resolved', 'Verified'];
  return <>
    <PageHeader eyebrow={role === 'student' ? 'Student services / Track your reports' : 'Campus issue registry'} title={role === 'student' ? 'My issues' : 'Issue tracking'} subtitle={role === 'student' ? 'Follow each report from submission through resolution.' : 'Search campus reports and inspect their full progress.'} action={role === 'student' ? <Link className="button primary" href="/report" data-testid="button-new-report"><Plus size={14} /> New report</Link> : undefined} />
    <div className="card panel"><div className="filter-bar"><div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}><Search size={15} color="#819087" /><input className="search-field" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find ticket, issue or campus location" aria-label="Search issues" data-testid="input-search-issues" /></div><select className="select-field" value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter issue status" data-testid="select-issue-status">{filters.map((option) => <option key={option}>{option}</option>)}</select></div>
      {loading ? <LoadingBlock /> : error ? <ErrorBlock onRetry={onRetry} /> : issues.length ? <IssueRows issues={issues} onExpand={onExpand} expanded={expanded} timeline={timeline} /> : <EmptyBlock title="No matching issues" text={search || filter !== 'All statuses' ? 'Try a different search or status filter.' : 'Reports you submit will be tracked here.'} />}
    </div>
  </>;
}

function AdminPage({ overview, issues, loading, error, staff, assignFor, setAssignFor, assignStaff, setAssignStaff, assignDepartment, setAssignDepartment, notifySupporting, setNotifySupporting, onOpenAssign, onAssign, assigning, onStatus, updating, onRetry, expanded, onExpand, timeline }: { overview?: CampusOverview; issues: Issue[]; loading: boolean; error: unknown; staff: CampusUser[]; assignFor: number | null; setAssignFor: (id: number | null) => void; assignStaff: string; setAssignStaff: (id: string) => void; assignDepartment: string; setAssignDepartment: (value: string) => void; notifySupporting: boolean; setNotifySupporting: (value: boolean) => void; onOpenAssign: (issue: Issue) => void; onAssign: (issue: Issue) => void; assigning: boolean; onStatus: (id: number, status: 'In Progress' | 'Resolved' | 'Verified', note: string) => void; updating: boolean; onRetry: () => void; expanded: number | null; onExpand: (id: number | null) => void; timeline: (issue: Issue) => ReactNode }) {
  const severityRank: Record<string, number> = { Critical: 4, High: 3, Medium: 2, Low: 1 };
  const sorted = [...issues].sort((a, b) => b.priorityScore - a.priorityScore || severityRank[b.severity] - severityRank[a.severity] || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const departments = [...new Set([...issues.map((issue) => issue.primaryDepartment), ...staff.map((person) => person.department).filter((name): name is string => Boolean(name))])];
  return <>
    <PageHeader eyebrow="Operations / Dispatch" title="Triage console" subtitle="Route the highest-risk work first. Every handoff should have a clear owner." action={<Link href="/analytics" className="button" data-testid="button-view-analytics"><Activity size={14} /> View hotspots</Link>} />
    <div className="metric-grid"><Stat label="Active P1" value={overview?.activeP1 ?? '—'} note="Safety-critical queue" icon={AlertTriangle} /><Stat label="Needs assignment" value={overview?.unassigned ?? '—'} note="No maintenance owner yet" icon={Users} /><Stat label="Total reports" value={overview?.totalIssues ?? issues.length} note="Across Northbridge campus" icon={ClipboardList} /><Stat label="Avg triage" value={overview ? `${overview.averageTriageMinutes}m` : '—'} note="Time to first review" icon={Clock3} /></div>
    <div className="card panel"><div className="panel-head"><h2 className="panel-title">Priority queue</h2><span className="panel-meta">SORTED BY RISK SCORE</span></div>{loading ? <LoadingBlock /> : error ? <ErrorBlock onRetry={onRetry} /> : sorted.length === 0 ? <EmptyBlock /> :
      <div className="table-wrap"><table><thead><tr><th>Ticket / report</th><th>Risk</th><th>Department / owner</th><th>Status</th><th>Next action</th></tr></thead><tbody>{sorted.map((issue) => <tr key={issue.id} data-testid={`row-triage-${issue.id}`}>
        <td><strong>{issue.ticketId} · {issue.title}</strong><div style={{ color: '#8a958c', fontSize: 10, marginTop: 4 }}><MapPin size={10} style={{ verticalAlign: 'middle' }} /> {issue.location}</div></td>
        <td><Priority value={issue.priority} /><div style={{ font: '10px var(--app-font-mono)', color: '#839087', marginTop: 5 }}>{issue.priorityScore} / 100</div></td>
        <td><strong>{issue.primaryDepartment}</strong><div style={{ color: '#87928a', fontSize: 10, marginTop: 4 }}>{issue.assignedStaffName ?? 'Unassigned'}</div></td>
        <td><Status value={issue.status} /></td><td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {assignFor === issue.id ? <><select className="select-field" style={{ padding: '6px 8px', fontSize: 10 }} value={assignStaff} onChange={(event) => setAssignStaff(event.target.value)} aria-label={`Assign ${issue.ticketId} to staff`} data-testid={`select-assignee-${issue.id}`}><option value="">Choose teammate</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.name}{member.department ? ` · ${member.department}` : ''}</option>)}</select><select className="select-field" style={{ padding: '6px 8px', fontSize: 10 }} value={assignDepartment} onChange={(event) => setAssignDepartment(event.target.value)} aria-label={`Primary department for ${issue.ticketId}`} data-testid={`select-primary-department-${issue.id}`}>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select><label style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', color: '#718078', fontSize: 10 }}><input type="checkbox" checked={notifySupporting} onChange={(event) => setNotifySupporting(event.target.checked)} data-testid={`checkbox-notify-supporting-${issue.id}`} /> Notify supporting departments</label><button className="tiny-button" disabled={assigning} onClick={() => onAssign(issue)} data-testid={`button-confirm-assignment-${issue.id}`}>{assigning ? 'Saving…' : 'Save assignment'}</button><button className="tiny-button" onClick={() => setAssignFor(null)} data-testid={`button-cancel-assignment-${issue.id}`}>Cancel</button></>
            : <><button className="tiny-button" onClick={() => onOpenAssign(issue)} data-testid={`button-assign-${issue.id}`}>{issue.assignedStaffId ? 'Reassign' : 'Assign'}</button>{issue.status === 'Assigned' && <button className="tiny-button" disabled={updating} onClick={() => onStatus(issue.id, 'In Progress', 'Work started by maintenance team.')} data-testid={`button-start-${issue.id}`}>Start work</button>}{issue.status === 'In Progress' && <button className="tiny-button" disabled={updating} onClick={() => onStatus(issue.id, 'Resolved', 'Issue marked resolved by operations.')} data-testid={`button-resolve-${issue.id}`}>Resolve</button>}{issue.status === 'Resolved' && <button className="tiny-button" disabled={updating} onClick={() => onStatus(issue.id, 'Verified', 'Resolution verified by campus operations.')} data-testid={`button-verify-${issue.id}`}>Verify</button>}<button className="tiny-button" onClick={() => onExpand(expanded === issue.id ? null : issue.id)} data-testid={`button-triage-details-${issue.id}`}>{expanded === issue.id ? 'Close' : 'Details'}</button></>}
        </div></td>
      </tr>)}</tbody></table>{expanded !== null && (() => { const issue = sorted.find((item) => item.id === expanded); return issue ? <div className="panel" style={{ marginTop: 12, background: '#f5f3ea' }} data-testid={`panel-triage-detail-${issue.id}`}><div className="panel-head"><h3 className="panel-title">{issue.ticketId} · Issue detail</h3><button className="tiny-button" onClick={() => onOpenAssign(issue)} data-testid={`button-detail-assign-${issue.id}`}>{issue.assignedStaffId ? 'Change assignment' : 'Assign a team'}</button></div><div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 15 }}><div><div className="metric-label">PRIMARY CATEGORY</div><strong style={{ display: 'block', marginTop: 6, color: '#31564a', fontSize: 12 }}>{issue.primaryCategory}{issue.secondaryCategory ? ` · ${issue.secondaryCategory}` : ''}</strong></div><div><div className="metric-label">SAFETY HAZARD</div><strong style={{ display: 'block', marginTop: 6, color: issue.safetyRisk && issue.safetyRisk.toLowerCase() !== 'none' ? '#a34a3b' : '#31564a', fontSize: 12 }}>{issue.safetyRisk || 'No immediate hazard flagged'}</strong></div></div><p className="subtitle" style={{ fontSize: 11 }}>{issue.description}</p><div className="panel-meta" style={{ marginBottom: 10 }}>REPORT TIMELINE</div>{timeline(issue)}</div> : null; })()}</div>}
    </div>
  </>;
}

function StaffPage({ issues, loading, error, note, setNote, onStatus, updating, onRetry, expanded, onExpand, timeline }: { issues: Issue[]; loading: boolean; error: unknown; note: string; setNote: (value: string) => void; onStatus: (id: number, status: 'In Progress' | 'Resolved' | 'Verified', note: string) => void; updating: boolean; onRetry: () => void; expanded: number | null; onExpand: (id: number | null) => void; timeline: (issue: Issue) => ReactNode }) {
  const [resolutionId, setResolutionId] = useState<number | null>(null);
  const [resolutionPhoto, setResolutionPhoto] = useState('');
  useEffect(() => {
    if (!resolutionPhoto) return;
    return () => URL.revokeObjectURL(resolutionPhoto);
  }, [resolutionPhoto]);
  return <>
    <PageHeader eyebrow="Maintenance / Field work" title="Assigned work" subtitle="Your active campus jobs, ordered by urgency. Keep the handoff trail current." />
    <div className="metric-grid"><Stat label="Your open jobs" value={issues.filter((issue) => issue.status !== 'Resolved' && issue.status !== 'Verified').length} note="Assigned to this demo account" icon={Hammer} /><Stat label="High priority" value={issues.filter((issue) => issue.priority === 'P1' || issue.priority === 'P2').length} note="Respond as soon as practical" icon={Flame} /><Stat label="Completed" value={issues.filter((issue) => issue.status === 'Resolved' || issue.status === 'Verified').length} note="Resolved or verified jobs" icon={CheckCircle2} /><Stat label="Crew view" value="Northbridge" note="Facilities & campus operations" icon={Building2} /></div>
    <div className="issue-grid">{loading ? <LoadingBlock /> : error ? <ErrorBlock onRetry={onRetry} /> : issues.length === 0 ? <div className="card"><EmptyBlock title="No work assigned" text="When operations assigns a job to this team member, it will show here." /></div> : [...issues].sort((a, b) => b.priorityScore - a.priorityScore).map((issue) => <article className="card issue-card" key={issue.id} data-testid={`card-work-${issue.id}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}><div><div className="panel-meta">{issue.ticketId} · {issue.primaryDepartment}</div><h2 className="panel-title" style={{ margin: '8px 0 6px' }}>{issue.title}</h2><div className="issue-details"><span><MapPin size={10} /> {issue.location}</span><span>{issue.primaryCategory}</span></div></div><Priority value={issue.priority} /></div>
      <p className="subtitle" style={{ fontSize: 11, margin: '14px 0' }}>{issue.description}</p>
      <div className="callout" style={{ margin: '12px 0' }}>{issue.suggestedAction}</div>
      {issue.status !== 'Resolved' && issue.status !== 'Verified' && <div className="field-group" style={{ marginBottom: 11 }}><label className="form-label" htmlFor={`work-note-${issue.id}`}>Work note</label><input id={`work-note-${issue.id}`} className="form-field" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Arrival, inspection or repair details" data-testid={`input-work-note-${issue.id}`} /></div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTop: '1px solid #eeece4', paddingTop: 13 }}><Status value={issue.status} /><div style={{ display: 'flex', gap: 7 }}>
        {issue.status === 'Assigned' && <button className="button primary" disabled={updating} onClick={() => onStatus(issue.id, 'In Progress', note.trim() || 'Maintenance team started work.')} data-testid={`button-begin-work-${issue.id}`}>Start Work</button>}
        {issue.status === 'In Progress' && <button className="button primary" onClick={() => { setResolutionId(resolutionId === issue.id ? null : issue.id); onExpand(issue.id); }} data-testid={`button-complete-work-${issue.id}`}>Mark resolved</button>}
        <button className="button" onClick={() => onExpand(expanded === issue.id ? null : issue.id)} data-testid={`button-work-timeline-${issue.id}`}>{expanded === issue.id ? 'Hide timeline' : 'Timeline'}</button>
      </div></div>
      {resolutionId === issue.id && <div style={{ marginTop: 13 }}><label className="form-label" htmlFor={`resolution-note-${issue.id}`}>Resolution note</label><textarea className="form-field" id={`resolution-note-${issue.id}`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="What was repaired or checked?" data-testid={`input-resolution-note-${issue.id}`} /><label className="form-label" htmlFor={`resolution-photo-${issue.id}`} style={{ marginTop: 12 }}>After photo <span style={{ fontWeight: 400, color: '#8a958c' }}>· optional, local preview only</span></label><label className="button" htmlFor={`resolution-photo-${issue.id}`} data-testid={`button-add-resolution-photo-${issue.id}`}><Camera size={14} /> Take a photo or choose an image</label><input id={`resolution-photo-${issue.id}`} type="file" accept="image/*" capture="environment" style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} onChange={(event) => { const file = event.target.files?.[0]; if (file) setResolutionPhoto(URL.createObjectURL(file)); }} data-testid={`input-resolution-photo-${issue.id}`} />{resolutionPhoto && <img src={resolutionPhoto} alt="Local resolution photo preview" style={{ display: 'block', maxWidth: '100%', maxHeight: 160, marginTop: 10, borderRadius: 8, objectFit: 'cover' }} data-testid={`img-resolution-photo-preview-${issue.id}`} />}<p className="subtitle" style={{ marginTop: 9, fontSize: 10 }}>Confirming resolution returns this report to the student and awards their +10 credit resolution bonus.</p><button className="button primary" style={{ marginTop: 9 }} disabled={updating || !note.trim()} onClick={() => { onStatus(issue.id, 'Resolved', note); setResolutionId(null); setResolutionPhoto(''); }} data-testid={`button-confirm-resolve-${issue.id}`}>{updating ? 'Saving…' : 'Resolve and notify reporter'}</button></div>}
      {expanded === issue.id && <div style={{ marginTop: 15, paddingTop: 12, borderTop: '1px solid #eeece4' }}>{timeline(issue)}</div>}
    </article>)}</div>
  </>;
}

function AnalyticsPage({ analytics, overview, loading, error, onRetry }: { analytics?: CampusAnalytics; overview?: CampusOverview; loading: boolean; error: unknown; onRetry: () => void }) {
  const categories = analytics?.categories ?? [];
  const maxCount = Math.max(...categories.map((item) => item.count), 1);
  return <>
    <PageHeader eyebrow="Insights / Campus patterns" title="Campus analytics" subtitle="See where issues cluster, what teams are carrying, and where prevention can help." />
    {loading ? <LoadingBlock /> : error ? <ErrorBlock onRetry={onRetry} /> : <>
      <div className="metric-grid"><Stat label="Total reports" value={overview?.totalIssues ?? '—'} note="Campus-wide issue volume" icon={ClipboardList} /><Stat label="Today's hotspot" value={overview?.hotspotOfDay ?? '—'} note="Location with active concentration" icon={MapPin} /><Stat label="Resolution rate" value={overview ? `${overview.resolutionRate}%` : '—'} note="Issues closed across campus" icon={CheckCircle2} /><Stat label="Departments" value={analytics?.departments.length ?? 0} note="Teams in the shared response" icon={Building2} /></div>
      <div className="dashboard-grid"><section className="card panel"><div className="panel-head"><h2 className="panel-title">Primary & overlapping categories</h2><span className="panel-meta">REPORT VOLUME</span></div>{categories.length ? categories.map((item) => <div key={item.name} data-testid={`bar-category-${item.name.toLowerCase().replaceAll(' ', '-')}`} style={{ margin: '15px 0' }}><div style={{ display: 'flex', justifyContent: 'space-between', color: '#566b60', fontSize: 11, marginBottom: 7 }}><span>{item.name} <small style={{ color: '#97a198' }}>primary</small></span><strong>{item.count}</strong></div><div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(5, item.count / maxCount * 100)}%` }} /></div><div style={{ color: '#929b92', fontSize: 9, marginTop: 5 }}>{item.overlapCount} reports also tagged with another category</div></div>) : <EmptyBlock title="No category data" />}</section>
        <section className="card panel"><div className="panel-head"><h2 className="panel-title">Campus hotspots</h2><MapPin size={15} color="#917b4b" /></div>{analytics?.hotspots.length ? analytics.hotspots.map((spot, index) => <div className="hotspot" key={spot.location} data-testid={`hotspot-row-${index}`}><span className="hotspot-n">{String(index + 1).padStart(2, '0')}</span><div style={{ flex: 1 }}><strong>{spot.location}</strong><small>{spot.focus}</small></div><span style={{ textAlign: 'right' }}><strong>{spot.reports}</strong><small style={{ display: 'block' }}>{spot.aboveCampusMean > 0 ? `+${spot.aboveCampusMean}%` : `${spot.aboveCampusMean}%`} vs mean</small></span></div>) : <EmptyBlock title="No hotspots identified" />}</section>
      </div>
      <section className="card panel" style={{ marginTop: 17 }}><div className="panel-head"><h2 className="panel-title">Department workload</h2><span className="panel-meta">RESOLUTION PERFORMANCE</span></div>{analytics?.departments.length ? <div className="table-wrap"><table><thead><tr><th>Department</th><th>Total assignments</th><th>Resolved</th><th>Resolution rate</th><th>Avg. hours</th></tr></thead><tbody>{analytics.departments.map((department) => <tr key={department.name} data-testid={`row-department-${department.name.toLowerCase().replaceAll(' ', '-')}`}><td><strong>{department.name}</strong></td><td>{department.total}</td><td>{department.resolved}</td><td>{department.total ? Math.round(department.resolved / department.total * 100) : 0}%</td><td>{department.averageResolutionHours}</td></tr>)}</tbody></table></div> : <EmptyBlock title="No department data" />}</section>
      {analytics?.recommendation && <div className="callout" style={{ marginTop: 17 }} data-testid="text-analytics-recommendation"><Sparkles size={14} style={{ verticalAlign: 'middle', marginRight: 7 }} />{analytics.recommendation}</div>}
    </>}
  </>;
}

function CreditsPage({ profile, loading, error, onRetry, userName }: { profile?: CreditProfile; loading: boolean; error: unknown; onRetry: () => void; userName: string }) {
  return <>
    <PageHeader eyebrow="Community / Student participation" title="Campus credits" subtitle="Every useful report helps your campus teams spot problems sooner." />
    {loading ? <LoadingBlock /> : error ? <ErrorBlock onRetry={onRetry} /> : !profile ? <EmptyBlock title="Credit profile unavailable" text="Your profile will appear once student credits are available." /> : <>
      <div className="dashboard-grid"><section className="card panel" style={{ background: '#214b43', color: '#f4f0df', minHeight: 188 }}><div className="panel-meta" style={{ color: '#c8d6c7' }}>CAMPUSFIX CONTRIBUTOR</div><div style={{ display: 'flex', alignItems: 'end', justifyContent: 'space-between', gap: 20, marginTop: 26 }}><div><div style={{ fontSize: 12, color: '#d6e0d6' }}>{profile.userName || userName}</div><div style={{ font: '700 42px var(--app-font-serif)', letterSpacing: '-1px', marginTop: 4 }} data-testid="text-credit-balance">{profile.balance}<small style={{ font: '500 12px var(--app-font-mono)', color: '#dfbd77', marginLeft: 8 }}>CREDITS</small></div></div><div style={{ padding: '8px 11px', border: '1px solid #668278', borderRadius: 8, color: '#e1c27b', fontSize: 10 }}>{profile.tier}</div></div><div style={{ marginTop: 17, width: '100%', height: 3, background: '#40665b', borderRadius: 9 }}><div style={{ width: `${Math.max(6, Math.min(100, profile.balance % 100))}%`, height: '100%', background: '#dfbd77', borderRadius: 9 }} /></div></section>
        <section className="card panel"><div className="panel-head"><h2 className="panel-title">Your impact</h2><Award size={16} color="#947f4d" /></div><div className="callout">You are part of the campus safety network. Each helpful report gives teams the information to respond with confidence.</div><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}><span className="panel-meta">REPORT ACTIVITY</span><strong style={{ fontSize: 12, color: '#315248' }}>{profile.activity.length} contributions</strong></div></section></div>
      <section style={{ marginTop: 20 }}><div className="panel-head"><h2 className="panel-title">Contributor badges</h2><span className="panel-meta">{profile.badges.filter((badge) => badge.awarded).length} EARNED</span></div><div className="badge-grid">{profile.badges.map((badge) => <article key={badge.name} className={`card badge-card ${badge.awarded ? '' : 'locked'}`} data-testid={`badge-${badge.name.toLowerCase().replaceAll(' ', '-')}`}><div className="badge-mark"><Award size={17} /></div><strong>{badge.name}</strong><p>{badge.description}</p></article>)}</div></section>
      <section className="card panel" style={{ marginTop: 20 }}><div className="panel-head"><h2 className="panel-title">Credit history</h2><span className="panel-meta">RECENT ACTIVITY</span></div>{profile.activity.length ? profile.activity.map((activity) => <div className="issue-row" key={activity.id} data-testid={`row-credit-activity-${activity.id}`}><span className="issue-code" style={{ color: '#4d735e' }}>+{activity.points}</span><div><div className="issue-title">{activity.description}</div><div className="issue-details">{new Date(activity.createdAt).toLocaleDateString()}</div></div><span style={{ font: '500 12px var(--app-font-mono)', color: '#426954' }}>+{activity.points}</span></div>) : <EmptyBlock title="No credit activity yet" text="Submit a useful report to start your campus contribution history." />}</section>
    </>}
  </>;
}

function NotificationsPage({ notifications, loading, error, onRetry, onRead, busy }: { notifications: CampusNotification[]; loading: boolean; error: unknown; onRetry: () => void; onRead: (id: number) => void; busy: boolean }) {
  const iconFor = (type: string) => type === 'credits' ? Award : type === 'assignment' ? Wrench : Bell;
  return <>
    <PageHeader eyebrow="Community / Updates" title="Notifications" subtitle="Status changes and campus activity that need your attention." action={<span className="panel-meta">{notifications.filter((notification) => !notification.read).length} UNREAD</span>} />
    <section className="card" data-testid="list-notifications">{loading ? <div className="panel"><LoadingBlock /></div> : error ? <div className="panel"><ErrorBlock onRetry={onRetry} /></div> : notifications.length ? [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((notification) => {
      const Icon = iconFor(notification.type);
      return <article key={notification.id} className={`notification ${notification.read ? '' : 'unread'}`} data-testid={`notification-${notification.id}`}><span className="notification-icon"><Icon size={15} /></span><div><strong>{notification.title}</strong><p>{notification.message}</p><time>{new Date(notification.createdAt).toLocaleString()}</time></div>{!notification.read && <button className="tiny-button" disabled={busy} onClick={() => onRead(notification.id)} data-testid={`button-mark-read-${notification.id}`}><Check size={13} /> Read</button>}</article>;
    }) : <EmptyBlock title="You're all caught up" text="Updates about reports and campus credits will appear here." />}</section>
  </>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function Router() {
  return <RoutedErrorBoundary><AppShell /></RoutedErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}
export default App;
