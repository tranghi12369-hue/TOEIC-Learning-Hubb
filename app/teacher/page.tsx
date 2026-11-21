"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { supabase } from "../../lib/supabase";

/* ---------- Types ---------- */
type View = "dashboard" | "classes" | "homework" | "questions" | "results";
type Status = "Chưa làm" | "Đang làm" | "Đã nộp";

interface Profile { id: string; full_name: string | null; role: string }
interface ClassRow { id: number; name: string }
interface Student { id: string; full_name: string | null; email: string | null; class_id: number | null }
interface Hw { id: number; student_id: string; title: string; section: string; questions: number; deadline: string; status: Status }
interface Attempt { id: number; student_id: string; name: string; score: number; total: number; completed_at: string }
interface Question { id: number; part: string; group_key: string; passage: string | null; audio_url: string | null; image_url: string | null; question: string; options: string[]; answer: number; explanation: string | null }
interface QBlock { q: string; opts: string[]; answer: number; exp: string }
interface PartCfg { id: string; label: string; audio: boolean; image: boolean; passage: boolean; group: boolean; opts: number; hear: boolean }
interface HwGroup { key: string; title: string; section: string; deadline: string; ids: number[]; total: number; submitted: number; classes: string[] }

/* ---------- Constants ---------- */
const SECTIONS = [
  "Listening Part 1", "Listening Part 2", "Listening Part 3", "Listening Part 4",
  "Reading Part 5", "Reading Part 6", "Reading Part 7", "Grammar", "Vocabulary", "Mini Test",
];

const NAV: { id: View; label: string; icon: string }[] = [
  { id: "dashboard", label: "Dashboard", icon: "home" },
  { id: "classes", label: "Lớp học", icon: "users" },
  { id: "homework", label: "Bài tập", icon: "clipboard" },
  { id: "questions", label: "Ngân hàng đề", icon: "book" },
  { id: "results", label: "Kết quả", icon: "chart" },
];

// hear = đáp án chỉ nghe, có thể để trống chữ. group = nhiều câu dùng chung audio/đoạn văn.
const PARTS: PartCfg[] = [
  { id: "l1", label: "Listening Part 1 – Mô tả tranh", audio: true, image: true, passage: false, group: false, opts: 4, hear: true },
  { id: "l2", label: "Listening Part 2 – Hỏi đáp", audio: true, image: false, passage: false, group: false, opts: 3, hear: true },
  { id: "l3", label: "Listening Part 3 – Hội thoại", audio: true, image: true, passage: false, group: true, opts: 4, hear: false },
  { id: "l4", label: "Listening Part 4 – Bài nói chuyện", audio: true, image: true, passage: false, group: true, opts: 4, hear: false },
  { id: "r5", label: "Reading Part 5 – Hoàn thành câu", audio: false, image: false, passage: false, group: false, opts: 4, hear: false },
  { id: "r6", label: "Reading Part 6 – Hoàn thành đoạn văn", audio: false, image: false, passage: true, group: true, opts: 4, hear: false },
  { id: "r7", label: "Reading Part 7 – Đọc hiểu", audio: false, image: true, passage: true, group: true, opts: 4, hear: false },
  { id: "g", label: "Grammar – Ngữ pháp", audio: false, image: false, passage: false, group: false, opts: 4, hear: false },
  { id: "v", label: "Vocabulary – Từ vựng", audio: false, image: false, passage: false, group: false, opts: 4, hear: false },
];
const emptyBlock = (): QBlock => ({ q: "", opts: ["", "", "", ""], answer: 0, exp: "" });

const ICONS: Record<string, string> = {
  home: "M3 12l9-9 9 9M5 10v10h14V10",
  users: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.9M16 3.1a4 4 0 010 7.8",
  clipboard: "M9 3h6a1 1 0 011 1v2H8V4a1 1 0 011-1zM8 5H6a1 1 0 00-1 1v14a1 1 0 001 1h12a1 1 0 001-1V6a1 1 0 00-1-1h-2",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  bell: "M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0",
  check: "M20 6L9 17l-5-5",
  star: "M12 2l3 7 7 .6-5.3 4.8L18.2 22 12 18l-6.2 4 1.5-7.6L2 9.6 9 9z",
  flame: "M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z",
  menu: "M4 6h16M4 12h16M4 18h16",
  plus: "M12 5v14M5 12h14",
  logout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
  trash: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14",
  arrow: "M5 12h14M13 6l6 6-6 6",
  book: "M4 19.5A2.5 2.5 0 016.5 17H20V3H6.5A2.5 2.5 0 004 5.5v14z",
};

const GLASS = "rounded-2xl border border-white/70 bg-white/75 shadow-[0_8px_30px_rgba(30,64,175,0.08)] backdrop-blur-xl";
const INPUT = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

/* ---------- Helpers ---------- */
const pct = (a: Attempt) => (a.total > 0 ? Math.round((a.score / a.total) * 100) : 0);
const avgOf = (list: Attempt[]) => (list.length ? Math.round(list.reduce((s, a) => s + pct(a), 0) / list.length) : null);
const todayStr = () => new Date().toLocaleDateString("sv-SE");
const nameOf = (s?: Student) => s?.full_name || s?.email || "Học viên";

function fmtDate(d: string): string {
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? d : date.toLocaleDateString("vi-VN");
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1]?.[0] ?? "?").toUpperCase() + (parts.length > 1 ? parts[0][0].toUpperCase() : "");
}

function grade(p: number | null): { label: string; cls: string } {
  if (p === null) return { label: "—", cls: "bg-slate-100 text-slate-500" };
  if (p >= 90) return { label: "A+", cls: "bg-emerald-100 text-emerald-700" };
  if (p >= 80) return { label: "A", cls: "bg-blue-100 text-blue-700" };
  if (p >= 70) return { label: "B", cls: "bg-sky-100 text-sky-700" };
  if (p >= 60) return { label: "C", cls: "bg-amber-100 text-amber-700" };
  return { label: "D", cls: "bg-rose-100 text-rose-700" };
}

function groupStatus(g: HwGroup): { t: string; c: string } {
  if (g.total > 0 && g.submitted === g.total) return { t: "Hoàn thành", c: "bg-emerald-100 text-emerald-700" };
  if (g.deadline < todayStr()) return { t: "Quá hạn", c: "bg-rose-100 text-rose-700" };
  return { t: "Đang diễn ra", c: "bg-amber-100 text-amber-700" };
}

function weeklyAvg(list: Attempt[]) {
  const now = Date.now();
  const W = 7 * 86400000;
  return Array.from({ length: 6 }, (_, k) => {
    const e = now - (5 - k) * W;
    const s = e - W;
    const d = new Date(e);
    const part = list.filter((a) => {
      const t = new Date(a.completed_at).getTime();
      return t > s && t <= e;
    });
    return { label: `${d.getDate()}/${d.getMonth() + 1}`, value: avgOf(part) };
  });
}

/* ---------- Small components ---------- */
function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={ICONS[name] ?? ""} />
    </svg>
  );
}

function Card({ title, icon, action, className = "", children }: { title: string; icon: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`${GLASS} p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700"><Icon name={icon} className="h-4 w-4" /></span>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 text-center text-sm text-slate-500">{text}</p>;
}

function Bar({ value, color = "bg-blue-600" }: { value: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100/70">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function MiniStat({ label, value, tone, icon }: { label: string; value: string; tone: string; icon: string }) {
  return (
    <div className={`rounded-xl p-3 ${tone}`}>
      <Icon name={icon} className="h-5 w-5" />
      <p className="mt-2 text-xl font-bold leading-none">{value}</p>
      <p className="mt-1 text-xs opacity-80">{label}</p>
    </div>
  );
}

function Donut({ parts, center, sub }: { parts: { value: number; color: string }[]; center: string; sub: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const total = parts.reduce((s, p) => s + p.value, 0);
  let offset = 0;
  return (
    <div className="relative h-36 w-36 shrink-0">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" role="img" aria-label="Biểu đồ tiến độ bài tập">
        <circle cx={70} cy={70} r={r} fill="none" stroke="#e2e8f0" strokeWidth={16} />
        {total > 0 &&
          parts.map((p, i) => {
            const len = (p.value / total) * c;
            const el = <circle key={i} cx={70} cy={70} r={r} fill="none" stroke={p.color} strokeWidth={16} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} />;
            offset += len;
            return el;
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-slate-900">{center}</span>
        <span className="text-xs text-slate-500">{sub}</span>
      </div>
    </div>
  );
}

function HwTable({ groups, onDelete }: { groups: HwGroup[]; onDelete?: (g: HwGroup) => void }) {
  if (groups.length === 0) return <Empty text="Chưa có bài tập nào được giao." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-xs text-slate-500">
          <tr>
            <th className="px-2 py-2 font-medium">Bài tập</th>
            <th className="px-2 py-2 font-medium">Lớp</th>
            <th className="px-2 py-2 font-medium">Hạn nộp</th>
            <th className="px-2 py-2 font-medium">Đã nộp</th>
            <th className="px-2 py-2 font-medium">Trạng thái</th>
            {onDelete && <th className="px-2 py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {groups.map((g) => {
            const st = groupStatus(g);
            return (
              <tr key={g.key} className="hover:bg-blue-50/50">
                <td className="px-2 py-3">
                  <p className="font-medium text-slate-900">{g.title}</p>
                  <span className="mt-1 inline-block rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{g.section}</span>
                </td>
                <td className="px-2 py-3 text-slate-600">{g.classes.length ? g.classes.join(", ") : "—"}</td>
                <td className="px-2 py-3 text-slate-600">{fmtDate(g.deadline)}</td>
                <td className="px-2 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-20"><Bar value={g.total ? (g.submitted / g.total) * 100 : 0} color="bg-emerald-500" /></div>
                    <span className="text-xs text-slate-500">{g.submitted}/{g.total}</span>
                  </div>
                </td>
                <td className="px-2 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${st.c}`}>{st.t}</span></td>
                {onDelete && (
                  <td className="px-2 py-3 text-right">
                    <button onClick={() => onDelete(g)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Xóa bài tập">
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ResultTable({ rows, students, classMap }: { rows: Attempt[]; students: Map<string, Student>; classMap: Map<number, string> }) {
  if (rows.length === 0) return <Empty text="Chưa có học viên nào nộp bài." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-xs text-slate-500">
          <tr>
            <th className="px-2 py-2 font-medium">Học viên</th>
            <th className="px-2 py-2 font-medium">Lớp</th>
            <th className="px-2 py-2 font-medium">Bài làm</th>
            <th className="px-2 py-2 font-medium">Điểm</th>
            <th className="px-2 py-2 font-medium">Xếp loại</th>
            <th className="px-2 py-2 font-medium">Ngày nộp</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((a) => {
            const s = students.get(a.student_id);
            const g = grade(pct(a));
            return (
              <tr key={a.id} className="hover:bg-blue-50/50">
                <td className="px-2 py-3 font-medium text-slate-900">{nameOf(s)}</td>
                <td className="px-2 py-3 text-slate-600">{(s?.class_id != null && classMap.get(s.class_id)) || "—"}</td>
                <td className="px-2 py-3 text-slate-700">{a.name}</td>
                <td className="px-2 py-3 font-semibold text-slate-800">{a.score}/{a.total}</td>
                <td className="px-2 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${g.cls}`}>{g.label}</span></td>
                <td className="px-2 py-3 text-slate-500">{fmtDate(a.completed_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Page ---------- */
export default function TeacherPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [phase, setPhase] = useState<"loading" | "denied" | "ready">("loading");
  const [view, setView] = useState<View>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [homework, setHomework] = useState<Hw[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [cid, setCid] = useState<number | null>(null);

  const [newClass, setNewClass] = useState("");
  const [title, setTitle] = useState("");
  const [section, setSection] = useState(SECTIONS[0]);
  const [questions, setQuestions] = useState(10);
  const [deadline, setDeadline] = useState("");
  const [selClasses, setSelClasses] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  // Ngân hàng đề
  const [bank, setBank] = useState<Question[]>([]);
  const [qPart, setQPart] = useState("r5");
  const [qPassage, setQPassage] = useState("");
  const [qAudio, setQAudio] = useState<File | null>(null);
  const [qImage, setQImage] = useState<File | null>(null);
  const [qBlocks, setQBlocks] = useState<QBlock[]>([emptyBlock()]);
  const [qSaving, setQSaving] = useState(false);
  const [qFilter, setQFilter] = useState("all");
  const [bulk, setBulk] = useState("");
  const [fileKey, setFileKey] = useState(0);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  const load = useCallback(async () => {
    setError(null);
    const [c, p, h, a, qs] = await Promise.all([
      supabase.from("classes").select("id, name").order("name"),
      supabase.from("profiles").select("id, full_name, email, class_id").eq("role", "student").order("full_name"),
      supabase.from("homework").select("*"),
      supabase.from("attempts").select("*").order("completed_at", { ascending: false }),
      supabase.from("questions").select("*").order("id", { ascending: false }),
    ]);
    const firstError = c.error ?? p.error ?? h.error ?? a.error ?? qs.error;
    if (firstError) setError(firstError.message);
    setClasses((c.data ?? []) as ClassRow[]);
    setStudents((p.data ?? []) as Student[]);
    setHomework((h.data ?? []) as Hw[]);
    setAttempts((a.data ?? []) as Attempt[]);
    setBank((qs.data ?? []) as Question[]);
    setDataLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    async function init() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.replace("/login");
        return;
      }
      const { data, error: pErr } = await supabase.from("profiles").select("id, full_name, role").eq("id", session.user.id).single();
      if (!active) return;
      if (pErr || !data || data.role !== "teacher") {
        setPhase("denied");
        return;
      }
      setProfile(data as Profile);
      setPhase("ready");
      await load();
    }
    init();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) window.location.replace("/login");
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [load]);

  /* ----- Derived ----- */
  const classMap = useMemo(() => new Map(classes.map((c) => [c.id, c.name] as [number, string])), [classes]);
  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s] as [string, Student])), [students]);

  const scope = useMemo(() => {
    const st = students.filter((s) => cid === null || s.class_id === cid);
    const ids = new Set(st.map((s) => s.id));
    const hw = homework.filter((h) => ids.has(h.student_id));
    const at = attempts.filter((a) => ids.has(a.student_id));
    const weekAgo = Date.now() - 7 * 86400000;
    const activeIds = new Set(at.filter((a) => new Date(a.completed_at).getTime() >= weekAgo).map((a) => a.student_id));
    const submitted = hw.filter((h) => h.status === "Đã nộp").length;
    const doing = hw.filter((h) => h.status === "Đang làm").length;
    return {
      st, hw, at, submitted, doing,
      todo: hw.length - submitted - doing,
      avg: avgOf(at),
      completion: hw.length ? Math.round((submitted / hw.length) * 100) : null,
      active: activeIds.size,
      remind: st.filter((s) => !activeIds.has(s.id)),
    };
  }, [students, homework, attempts, cid]);

  const classStats = useMemo(
    () =>
      classes.map((c) => {
        const st = students.filter((s) => s.class_id === c.id);
        const ids = new Set(st.map((s) => s.id));
        const hw = homework.filter((h) => ids.has(h.student_id));
        const done = hw.filter((h) => h.status === "Đã nộp").length;
        return { c, n: st.length, avg: avgOf(attempts.filter((a) => ids.has(a.student_id))), completion: hw.length ? Math.round((done / hw.length) * 100) : null };
      }),
    [classes, students, homework, attempts]
  );

  const hwGroups = useMemo(() => {
    const m = new Map<string, HwGroup>();
    scope.hw.forEach((h) => {
      const key = `${h.title}|${h.section}|${h.deadline}`;
      const g = m.get(key) ?? { key, title: h.title, section: h.section, deadline: h.deadline, ids: [], total: 0, submitted: 0, classes: [] };
      g.ids.push(h.id);
      g.total += 1;
      if (h.status === "Đã nộp") g.submitted += 1;
      const cn = classMap.get(studentMap.get(h.student_id)?.class_id ?? -1);
      if (cn && !g.classes.includes(cn)) g.classes.push(cn);
      m.set(key, g);
    });
    return Array.from(m.values()).sort((a, b) => b.deadline.localeCompare(a.deadline));
  }, [scope.hw, classMap, studentMap]);

  const weekly = useMemo(() => weeklyAvg(scope.at), [scope.at]);
  const qCounts = useMemo(() => {
    const m: Record<string, number> = {};
    bank.forEach((q) => {
      m[q.part] = (m[q.part] ?? 0) + 1;
    });
    return m;
  }, [bank]);
  const cfg = PARTS.find((p) => p.id === qPart) ?? PARTS[0];
  const shownQuestions = bank.filter((q) => qFilter === "all" || q.part === qFilter);
  const displayName = profile?.full_name || "Giáo viên";
  const overallGrade = grade(scope.avg);

  /* ----- Actions ----- */
  const go = (v: View) => {
    setView(v);
    setMenuOpen(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.replace("/login");
  };

  const createClass = async (e: FormEvent) => {
    e.preventDefault();
    const name = newClass.trim();
    if (!name) return;
    const { error: insErr } = await supabase.from("classes").insert({ name });
    if (insErr) return showToast(`Lỗi: ${insErr.message}`);
    setNewClass("");
    showToast(`Đã tạo lớp ${name}`);
    load();
  };

  const changeClass = async (studentId: string, value: string) => {
    const classId = value === "" ? null : Number(value);
    const { error: rpcErr } = await supabase.rpc("assign_student_class", { p_student: studentId, p_class: classId });
    if (rpcErr) return showToast(`Lỗi: ${rpcErr.message}`);
    setStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, class_id: classId } : s)));
  };

  const toggleClass = (id: number) =>
    setSelClasses((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submitAssign = async (e: FormEvent) => {
    e.preventDefault();
    const ids = students.filter((s) => s.class_id !== null && selClasses.has(s.class_id)).map((s) => s.id);
    if (!title.trim() || !deadline || ids.length === 0) return showToast("Nhập tiêu đề, hạn nộp và chọn lớp có ít nhất 1 học viên.");
    setSaving(true);
    const rows = ids.map((student_id) => ({ student_id, title: title.trim(), section, questions, deadline, status: "Chưa làm" as Status }));
    const { error: insErr } = await supabase.from("homework").insert(rows);
    setSaving(false);
    if (insErr) return showToast(`Lỗi: ${insErr.message}`);
    setTitle("");
    setDeadline("");
    setSelClasses(new Set());
    showToast(`Đã giao bài cho ${rows.length} học viên`);
    load();
  };

  const removeGroup = async (g: HwGroup) => {
    if (!window.confirm(`Xóa bài “${g.title}” của ${g.total} học viên?`)) return;
    const { error: delErr } = await supabase.from("homework").delete().in("id", g.ids);
    if (delErr) return showToast(`Lỗi: ${delErr.message}`);
    setHomework((prev) => prev.filter((h) => !g.ids.includes(h.id)));
    showToast("Đã xóa bài tập");
  };

  /* ----- Ngân hàng đề ----- */
  const changePart = (id: string) => {
    setQPart(id);
    setQBlocks([emptyBlock()]);
    setQPassage("");
    setQAudio(null);
    setQImage(null);
    setFileKey((k) => k + 1);
  };

  const updateBlock = (i: number, patch: Partial<QBlock>) =>
    setQBlocks((prev) => prev.map((b, k) => (k === i ? { ...b, ...patch } : b)));

  const uploadMedia = async (file: File): Promise<string> => {
    const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from("toeic-media").upload(path, file, { contentType: file.type || undefined });
    if (upErr) throw new Error(upErr.message);
    return supabase.storage.from("toeic-media").getPublicUrl(path).data.publicUrl;
  };

  const saveQuestions = async (e: FormEvent) => {
    e.preventDefault();
    if (cfg.audio && !qAudio) return showToast("Hãy chọn file âm thanh (mp3) cho phần Listening.");
    if (qPart === "l1" && !qImage) return showToast("Listening Part 1 cần có hình ảnh.");
    if (cfg.passage && !qPassage.trim()) return showToast("Hãy nhập đoạn văn.");
    for (const b of qBlocks) {
      if (!cfg.hear && (!b.q.trim() || b.opts.slice(0, cfg.opts).some((o) => !o.trim()))) {
        return showToast("Mỗi câu cần có nội dung và đủ các đáp án.");
      }
    }
    setQSaving(true);
    try {
      const audio_url = qAudio ? await uploadMedia(qAudio) : null;
      const image_url = qImage ? await uploadMedia(qImage) : null;
      const key = crypto.randomUUID();
      const rows = qBlocks.map((b) => ({
        part: qPart,
        group_key: cfg.group ? key : crypto.randomUUID(),
        passage: cfg.passage ? qPassage.trim() : null,
        audio_url,
        image_url,
        question: b.q.trim() || (qPart === "l1" ? "Chọn đáp án mô tả đúng bức tranh." : "Nghe và chọn đáp án đúng."),
        options: Array.from({ length: cfg.opts }, (_, i) => b.opts[i].trim() || "ABCD"[i]),
        answer: b.answer,
        explanation: b.exp.trim() || null,
      }));
      const { error: insErr } = await supabase.from("questions").insert(rows);
      if (insErr) throw new Error(insErr.message);
      changePart(qPart);
      showToast(`Đã thêm ${rows.length} câu hỏi`);
      load();
    } catch (err) {
      showToast(`Lỗi: ${err instanceof Error ? err.message : "không lưu được"}`);
    }
    setQSaving(false);
  };

  const importBulk = async () => {
    const rows: Record<string, unknown>[] = [];
    let skipped = 0;
    bulk
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .forEach((line) => {
        const c = line.split("|").map((x) => x.trim());
        const letter = (c[5] ?? "").toUpperCase();
        const ai = "ABCD".indexOf(letter);
        if (c.length < 6 || !c[0] || c.slice(1, 5).some((o) => !o) || letter.length !== 1 || ai < 0) {
          skipped += 1;
          return;
        }
        rows.push({ part: qPart, group_key: crypto.randomUUID(), question: c[0], options: c.slice(1, 5), answer: ai, explanation: c.slice(6).join(" | ") || null });
      });
    if (rows.length === 0) return showToast("Không có dòng nào đúng định dạng.");
    setQSaving(true);
    const { error: insErr } = await supabase.from("questions").insert(rows);
    setQSaving(false);
    if (insErr) return showToast(`Lỗi: ${insErr.message}`);
    setBulk("");
    showToast(`Đã thêm ${rows.length} câu${skipped ? `, bỏ qua ${skipped} dòng sai định dạng` : ""}`);
    load();
  };

  const removeQuestion = async (id: number) => {
    if (!window.confirm("Xóa câu hỏi này?")) return;
    const { error: delErr } = await supabase.from("questions").delete().eq("id", id);
    if (delErr) return showToast(`Lỗi: ${delErr.message}`);
    setBank((prev) => prev.filter((q) => q.id !== id));
  };

  const remindToast = () => {
    const r = scope.remind;
    showToast(
      r.length === 0
        ? "Tất cả học viên đều đã làm bài trong 7 ngày qua 🎉"
        : `Chưa làm bài 7 ngày qua: ${r.slice(0, 3).map(nameOf).join(", ")}${r.length > 3 ? ` và ${r.length - 3} người khác` : ""}`
    );
  };

  /* ----- Early returns (sau tất cả hooks) ----- */
  if (phase === "loading") {
    return <div className="flex min-h-screen items-center justify-center text-slate-600">Đang tải tài khoản...</div>;
  }

  if (phase === "denied") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-white to-rose-50 px-4">
        <div className={`${GLASS} w-full max-w-md p-8 text-center`}>
          <h1 className="text-xl font-semibold text-slate-900">Không có quyền truy cập</h1>
          <p className="mt-2 text-sm text-slate-500">Tài khoản này không phải tài khoản giáo viên.</p>
          <div className="mt-6 flex justify-center gap-3">
            <a href="/" className="rounded-lg bg-[#0B1F4B] px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-800">Về trang học viên</a>
            <button onClick={signOut} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm text-slate-700 hover:bg-white">Đăng xuất</button>
          </div>
        </div>
      </div>
    );
  }

  const sidebar = (
    <nav className="flex h-full flex-col bg-gradient-to-b from-[#0B1F4B] to-blue-900 text-white">
      <div className="flex items-center gap-3 px-5 py-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500 text-lg font-bold">T</span>
        <div>
          <p className="text-sm font-semibold leading-tight">TOEIC Learning Hub</p>
          <p className="text-xs text-blue-200">Cổng giáo viên</p>
        </div>
      </div>
      <ul className="flex-1 space-y-1 px-3">
        {NAV.map((n) => (
          <li key={n.id}>
            <button
              onClick={() => go(n.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${view === n.id ? "bg-blue-500 font-medium text-white shadow-lg" : "text-blue-100 hover:bg-white/10"}`}
            >
              <Icon name={n.icon} />
              {n.label}
            </button>
          </li>
        ))}
      </ul>
      <div className="mx-4 rounded-2xl bg-white/10 p-4 text-sm italic leading-relaxed text-blue-100">
        “Dạy hôm nay,<br />học viên tiến bộ mỗi ngày.”
      </div>
      <button onClick={signOut} className="m-4 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-blue-100 hover:bg-white/10">
        <Icon name="logout" />
        Đăng xuất
      </button>
    </nav>
  );

  const filterOpts: { id: number | null; name: string }[] = [{ id: null, name: "Tất cả lớp" }, ...classes];
  const filterBar = (
    <div className="flex flex-wrap gap-2">
      {filterOpts.map((o) => (
        <button
          key={o.id ?? "all"}
          onClick={() => setCid(o.id)}
          className={`rounded-full px-4 py-1.5 text-sm transition ${cid === o.id ? "bg-[#0B1F4B] text-white shadow" : "bg-white/80 text-slate-600 hover:bg-white"}`}
        >
          {o.name}
        </button>
      ))}
    </div>
  );

  const donutParts = [
    { label: "Đã nộp", value: scope.submitted, color: "#10b981" },
    { label: "Đang làm", value: scope.doing, color: "#f59e0b" },
    { label: "Chưa làm", value: scope.todo, color: "#94a3b8" },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-sky-50 via-white to-rose-50 text-slate-800">
      <div className="pointer-events-none absolute -left-20 top-1/3 h-96 w-96 rounded-full bg-blue-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-rose-300/30 blur-3xl" />

      <aside className="fixed inset-y-3 left-3 z-20 hidden w-60 overflow-hidden rounded-3xl shadow-xl lg:block">{sidebar}</aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMenuOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72">{sidebar}</aside>
        </div>
      )}

      <div className="relative z-10 lg:pl-64">
        <div className="mx-auto max-w-7xl space-y-5 p-3 sm:p-5">
          {/* Top bar */}
          <header className={`${GLASS} flex items-center gap-3 px-4 py-2.5`}>
            <button onClick={() => setMenuOpen(true)} className="rounded-lg p-2 text-slate-600 hover:bg-white lg:hidden" aria-label="Mở menu">
              <Icon name="menu" />
            </button>
            <nav className="hidden items-center gap-1 md:flex">
              {NAV.map((n) => (
                <button
                  key={n.id}
                  onClick={() => go(n.id)}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${view === n.id ? "bg-blue-100 font-medium text-blue-700" : "text-slate-600 hover:bg-white"}`}
                >
                  <Icon name={n.icon} className="h-4 w-4" />
                  {n.label}
                </button>
              ))}
            </nav>
            <button onClick={remindToast} className="relative ml-auto rounded-full bg-white p-2.5 text-slate-600 shadow-sm hover:text-blue-700" aria-label="Thông báo">
              <Icon name="bell" />
              {scope.remind.length > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-semibold text-white">{scope.remind.length}</span>
              )}
            </button>
            <div className="flex items-center gap-2 rounded-full bg-white py-1 pl-1 pr-4 shadow-sm">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">{initials(displayName)}</span>
              <div className="hidden leading-tight sm:block">
                <p className="text-sm font-semibold text-slate-800">{displayName}</p>
                <p className="text-xs text-slate-500">Giáo viên</p>
              </div>
            </div>
          </header>

          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Không tải được dữ liệu: {error}</div>}

          {dataLoading ? (
            <p className="text-sm text-slate-500">Đang tải dữ liệu...</p>
          ) : (
            <>
              {/* ===== DASHBOARD ===== */}
              {view === "dashboard" && (
                <>
                  {filterBar}

                  <div className="grid gap-5 xl:grid-cols-12">
                    <section className={`${GLASS} p-5 xl:col-span-5`}>
                      <div className="flex items-center gap-4">
                        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-[#0B1F4B] text-2xl font-semibold text-white ring-4 ring-white">{initials(displayName)}</span>
                        <div className="min-w-0">
                          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">Xin chào, {displayName}! 👋</h1>
                          <p className="text-sm text-slate-500">Theo dõi tiến độ lớp học thật dễ dàng.</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
                            <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-700">Số lớp: {classes.length}</span>
                            <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-700">Học viên: {scope.st.length}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-5 grid grid-cols-3 gap-3">
                        <MiniStat label="Hoàn thành bài" value={scope.completion === null ? "—" : `${scope.completion}%`} tone="bg-sky-50 text-sky-700" icon="check" />
                        <MiniStat label="Hoạt động 7 ngày" value={`${scope.active}/${scope.st.length}`} tone="bg-rose-50 text-rose-600" icon="flame" />
                        <MiniStat label="Điểm trung bình" value={overallGrade.label === "—" ? "—" : `${scope.avg}%`} tone="bg-amber-50 text-amber-600" icon="star" />
                      </div>
                    </section>

                    <Card title="Lớp của tôi" icon="users" className="xl:col-span-4" action={<button onClick={() => go("classes")} className="text-xs font-medium text-blue-700 hover:underline">Quản lý</button>}>
                      {classStats.length === 0 ? (
                        <Empty text="Chưa có lớp nào. Hãy tạo lớp đầu tiên." />
                      ) : (
                        <ul className="space-y-2">
                          {classStats.slice(0, 4).map((s) => {
                            const g = grade(s.avg);
                            return (
                              <li key={s.c.id}>
                                <button
                                  onClick={() => setCid(cid === s.c.id ? null : s.c.id)}
                                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${cid === s.c.id ? "border-blue-500 bg-blue-50" : "border-slate-100 bg-white/70 hover:bg-white"}`}
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium text-slate-900">{s.c.name}</span>
                                    <span className="text-xs text-slate-500">{s.n} học viên · hoàn thành {s.completion === null ? "—" : `${s.completion}%`}</span>
                                  </span>
                                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${g.cls}`}>{g.label}</span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </Card>

                    <Card title="Tiến độ bài tập" icon="clipboard" className="xl:col-span-3">
                      <div className="flex flex-col items-center gap-4 sm:flex-row xl:flex-col 2xl:flex-row">
                        <Donut parts={donutParts} center={scope.completion === null ? "—" : `${scope.completion}%`} sub="đã nộp" />
                        <ul className="space-y-2 text-sm">
                          {donutParts.map((p) => (
                            <li key={p.label} className="flex items-center gap-2 text-slate-600">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
                              {p.label}
                              <span className="ml-auto font-semibold text-slate-800">{p.value}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </Card>
                  </div>

                  <div className="grid gap-5 xl:grid-cols-12">
                    <Card title="Bài tập đã giao" icon="clipboard" className="xl:col-span-8" action={<button onClick={() => go("homework")} className="text-xs font-medium text-blue-700 hover:underline">Xem tất cả</button>}>
                      <HwTable groups={hwGroups.slice(0, 4)} />
                    </Card>

                    <Card title="Truy cập nhanh" icon="arrow" className="xl:col-span-4">
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: "Giao bài tập", sub: "Cho cả lớp", icon: "clipboard", tone: "bg-blue-50 text-blue-700", run: () => go("homework") },
                          { label: "Lớp học", sub: "Xếp lớp học viên", icon: "users", tone: "bg-emerald-50 text-emerald-700", run: () => go("classes") },
                          { label: "Kết quả", sub: "Điểm từng học viên", icon: "chart", tone: "bg-amber-50 text-amber-700", run: () => go("results") },
                          { label: "Cần nhắc nhở", sub: `${scope.remind.length} học viên`, icon: "bell", tone: "bg-rose-50 text-rose-600", run: remindToast },
                        ].map((q) => (
                          <button key={q.label} onClick={q.run} className={`rounded-xl p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${q.tone}`}>
                            <Icon name={q.icon} />
                            <p className="mt-3 text-sm font-semibold">{q.label}</p>
                            <p className="text-xs opacity-75">{q.sub}</p>
                          </button>
                        ))}
                      </div>
                    </Card>
                  </div>

                  <div className="grid gap-5 xl:grid-cols-12">
                    <Card title="Kết quả bài làm gần đây" icon="chart" className="xl:col-span-8" action={<button onClick={() => go("results")} className="text-xs font-medium text-blue-700 hover:underline">Xem tất cả</button>}>
                      <ResultTable rows={scope.at.slice(0, 5)} students={studentMap} classMap={classMap} />
                    </Card>

                    <Card title="Điểm TB theo tuần" icon="star" className="xl:col-span-4">
                      <div className="flex items-end gap-2">
                        {weekly.map((w, i) => (
                          <div key={i} className="flex flex-1 flex-col items-center gap-1">
                            <span className="text-xs font-medium text-slate-600">{w.value === null ? "–" : w.value}</span>
                            <div className="flex h-32 w-full items-end">
                              <div className="w-full rounded-t-md bg-gradient-to-t from-blue-600 to-sky-400" style={{ height: `${w.value ?? 0}%`, minHeight: w.value ? 4 : 0 }} />
                            </div>
                            <span className="text-[10px] text-slate-400">{w.label}</span>
                          </div>
                        ))}
                      </div>
                      <p className="mt-4 rounded-xl bg-blue-50 p-3 text-xs text-blue-800">
                        {scope.remind.length > 0 ? `${scope.remind.length} học viên chưa làm bài trong 7 ngày qua, hãy nhắc các em nhé.` : "Cả lớp đều đang học đều đặn. Tuyệt vời!"}
                      </p>
                    </Card>
                  </div>
                </>
              )}

              {/* ===== LỚP HỌC ===== */}
              {view === "classes" && (
                <>
                  <Card title="Lớp học" icon="users">
                    <form onSubmit={createClass} className="mb-4 flex flex-col gap-2 sm:flex-row">
                      <input value={newClass} onChange={(e) => setNewClass(e.target.value)} placeholder="Tên lớp mới, VD: TOEIC-HCM-26B" className={`${INPUT} max-w-md`} />
                      <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0B1F4B] px-4 py-2 text-sm font-medium text-white hover:bg-blue-800">
                        <Icon name="plus" className="h-4 w-4" /> Tạo lớp
                      </button>
                    </form>
                    {classStats.length === 0 ? (
                      <Empty text="Chưa có lớp nào. Hãy tạo lớp đầu tiên ở trên." />
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {classStats.map((s) => (
                          <button
                            key={s.c.id}
                            onClick={() => { setCid(s.c.id); go("dashboard"); }}
                            className="rounded-xl border border-slate-100 bg-white/80 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                          >
                            <p className="font-semibold text-slate-900">{s.c.name}</p>
                            <p className="mb-3 text-xs text-slate-500">{s.n} học viên · nhấn để xem chi tiết</p>
                            <div className="space-y-2 text-xs text-slate-500">
                              <div><div className="mb-1 flex justify-between"><span>Điểm trung bình</span><span className="font-semibold text-slate-800">{s.avg === null ? "—" : `${s.avg}%`}</span></div><Bar value={s.avg ?? 0} /></div>
                              <div><div className="mb-1 flex justify-between"><span>Hoàn thành bài</span><span className="font-semibold text-slate-800">{s.completion === null ? "—" : `${s.completion}%`}</span></div><Bar value={s.completion ?? 0} color="bg-sky-400" /></div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </Card>

                  <Card title="Xếp lớp cho học viên" icon="users">
                    {students.length === 0 ? (
                      <Empty text="Chưa có học viên nào. Học viên cần đăng ký tài khoản trước." />
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[480px] text-left text-sm">
                          <thead className="text-xs text-slate-500">
                            <tr><th className="px-2 py-2 font-medium">Học viên</th><th className="px-2 py-2 font-medium">Lớp</th></tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {students.map((s) => (
                              <tr key={s.id} className="hover:bg-blue-50/50">
                                <td className="px-2 py-3">
                                  <p className="font-medium text-slate-900">{s.full_name || "Chưa đặt tên"}</p>
                                  <p className="text-xs text-slate-500">{s.email}</p>
                                </td>
                                <td className="px-2 py-3">
                                  <select value={s.class_id ?? ""} onChange={(e) => changeClass(s.id, e.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                                    <option value="">Chưa xếp lớp</option>
                                    {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                  </select>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>
                </>
              )}

              {/* ===== BÀI TẬP ===== */}
              {view === "homework" && (
                <>
                  <Card title="Giao bài tập cho lớp" icon="clipboard">
                    <form onSubmit={submitAssign} className="space-y-4">
                      <div>
                        <label htmlFor="hw-title" className="mb-1 block text-sm font-medium text-slate-700">Tiêu đề</label>
                        <input id="hw-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Mô tả tranh – Người và hoạt động" className={INPUT} />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div>
                          <label htmlFor="hw-section" className="mb-1 block text-sm font-medium text-slate-700">Phần thi</label>
                          <select id="hw-section" value={section} onChange={(e) => setSection(e.target.value)} className={INPUT}>
                            {SECTIONS.map((s) => <option key={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label htmlFor="hw-q" className="mb-1 block text-sm font-medium text-slate-700">Số câu hỏi</label>
                          <input id="hw-q" type="number" min={1} max={200} value={questions} onChange={(e) => setQuestions(Math.max(1, Number(e.target.value) || 1))} className={INPUT} />
                        </div>
                        <div>
                          <label htmlFor="hw-deadline" className="mb-1 block text-sm font-medium text-slate-700">Hạn nộp</label>
                          <input id="hw-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className={INPUT} />
                        </div>
                      </div>
                      <div>
                        <span className="mb-2 block text-sm font-medium text-slate-700">Giao cho lớp</span>
                        {classStats.length === 0 ? (
                          <Empty text="Chưa có lớp nào. Hãy tạo lớp ở mục Lớp học." />
                        ) : (
                          <div className="grid gap-2 sm:grid-cols-2">
                            {classStats.map((s) => (
                              <label key={s.c.id} className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${selClasses.has(s.c.id) ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                                <span className="flex items-center gap-3">
                                  <input type="checkbox" checked={selClasses.has(s.c.id)} onChange={() => toggleClass(s.c.id)} className="accent-blue-700" />
                                  {s.c.name}
                                </span>
                                <span className="text-xs text-slate-500">{s.n} học viên</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                      <button type="submit" disabled={saving} className="rounded-lg bg-[#0B1F4B] px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60">
                        {saving ? "Đang giao..." : "Giao bài tập"}
                      </button>
                    </form>
                  </Card>

                  <Card title="Bài tập đã giao" icon="book">
                    <div className="mb-4">{filterBar}</div>
                    <HwTable groups={hwGroups} onDelete={removeGroup} />
                  </Card>
                </>
              )}

              {/* ===== NGÂN HÀNG ĐỀ ===== */}
              {view === "questions" && (
                <>
                  <Card title="Thêm đề mới" icon="book">
                    <form onSubmit={saveQuestions} className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <label htmlFor="q-part" className="mb-1 block text-sm font-medium text-slate-700">Phần thi</label>
                          <select id="q-part" value={qPart} onChange={(e) => changePart(e.target.value)} className={INPUT}>
                            {PARTS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                          </select>
                        </div>
                        {cfg.audio && (
                          <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">File nghe (mp3)</label>
                            <input key={`a${fileKey}`} type="file" accept="audio/*" onChange={(e) => setQAudio(e.target.files?.[0] ?? null)} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-700" />
                          </div>
                        )}
                        {cfg.image && (
                          <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Hình ảnh{qPart === "l1" ? "" : " (nếu có)"}</label>
                            <input key={`i${fileKey}`} type="file" accept="image/*" onChange={(e) => setQImage(e.target.files?.[0] ?? null)} className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-700" />
                          </div>
                        )}
                      </div>

                      {cfg.passage && (
                        <div>
                          <label htmlFor="q-passage" className="mb-1 block text-sm font-medium text-slate-700">Đoạn văn (email, thông báo, bài báo...)</label>
                          <textarea id="q-passage" rows={6} value={qPassage} onChange={(e) => setQPassage(e.target.value)} className={INPUT} />
                        </div>
                      )}

                      {qBlocks.map((b, i) => (
                        <div key={i} className="space-y-3 rounded-xl border border-slate-200 bg-white/70 p-4">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-slate-800">Câu {i + 1}</p>
                            {qBlocks.length > 1 && (
                              <button type="button" onClick={() => setQBlocks((prev) => prev.filter((_, k) => k !== i))} className="text-xs text-rose-600 hover:underline">Xóa câu này</button>
                            )}
                          </div>
                          <input value={b.q} onChange={(e) => updateBlock(i, { q: e.target.value })} placeholder={cfg.hear ? "Câu hỏi (không bắt buộc)" : "Nội dung câu hỏi"} className={INPUT} />
                          <div className="grid gap-2 sm:grid-cols-2">
                            {Array.from({ length: cfg.opts }, (_, k) => (
                              <label key={k} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${b.answer === k ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-white"}`}>
                                <input type="radio" name={`ans-${i}`} checked={b.answer === k} onChange={() => updateBlock(i, { answer: k })} className="accent-emerald-600" />
                                <span className="font-semibold text-slate-500">{"ABCD"[k]}</span>
                                <input
                                  value={b.opts[k]}
                                  onChange={(e) => updateBlock(i, { opts: b.opts.map((o, x) => (x === k ? e.target.value : o)) })}
                                  placeholder={cfg.hear ? "(để trống nếu chỉ nghe)" : `Đáp án ${"ABCD"[k]}`}
                                  className="min-w-0 flex-1 bg-transparent outline-none"
                                />
                              </label>
                            ))}
                          </div>
                          <p className="text-xs text-slate-500">Chấm tròn xanh là đáp án đúng.</p>
                          <input value={b.exp} onChange={(e) => updateBlock(i, { exp: e.target.value })} placeholder="Giải thích hoặc lời thoại (hiện cho học sinh sau khi nộp bài, không bắt buộc)" className={INPUT} />
                        </div>
                      ))}

                      {cfg.group && (
                        <button type="button" onClick={() => setQBlocks((prev) => [...prev, emptyBlock()])} className="inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:underline">
                          <Icon name="plus" className="h-4 w-4" /> Thêm câu hỏi vào cùng đề
                        </button>
                      )}

                      <div>
                        <button type="submit" disabled={qSaving} className="rounded-lg bg-[#0B1F4B] px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60">
                          {qSaving ? "Đang lưu..." : `Lưu ${qBlocks.length} câu hỏi`}
                        </button>
                      </div>
                    </form>
                  </Card>

                  {!cfg.group && !cfg.hear && (
                    <Card title="Nhập nhanh nhiều câu" icon="clipboard">
                      <p className="mb-2 text-xs text-slate-500">Mỗi dòng một câu, ngăn cách bằng dấu |. Dùng cho phần đang chọn: {cfg.label}.</p>
                      <p className="mb-2 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">Câu hỏi | A | B | C | D | Đáp án đúng (A-D) | Giải thích</p>
                      <textarea
                        rows={6}
                        value={bulk}
                        onChange={(e) => setBulk(e.target.value)}
                        placeholder={"The report must be submitted ___ Friday. | by | on | at | in | A | Dùng by với hạn chót"}
                        className={INPUT}
                      />
                      <button onClick={importBulk} disabled={qSaving || !bulk.trim()} className="mt-3 rounded-lg bg-[#0B1F4B] px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60">
                        {qSaving ? "Đang nhập..." : "Nhập các câu này"}
                      </button>
                    </Card>
                  )}

                  <Card title="Ngân hàng đề" icon="clipboard">
                    <div className="mb-4 flex flex-wrap gap-2">
                      {[{ id: "all", label: "Tất cả" }, ...PARTS.map((p) => ({ id: p.id, label: p.label.split(" – ")[0] }))].map((o) => (
                        <button
                          key={o.id}
                          onClick={() => setQFilter(o.id)}
                          className={`rounded-full px-3 py-1.5 text-xs transition ${qFilter === o.id ? "bg-[#0B1F4B] text-white" : "bg-white/80 text-slate-600 hover:bg-white"}`}
                        >
                          {o.label} ({o.id === "all" ? bank.length : qCounts[o.id] ?? 0})
                        </button>
                      ))}
                    </div>
                    {shownQuestions.length === 0 ? (
                      <Empty text="Chưa có câu hỏi nào. Hãy thêm đề ở phía trên." />
                    ) : (
                      <ul className="space-y-2">
                        {shownQuestions.slice(0, 100).map((q) => (
                          <li key={q.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-white/80 p-3 text-sm">
                            <div className="min-w-0">
                              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                                <span className="rounded-md bg-blue-100 px-2 py-0.5 font-medium text-blue-700">{PARTS.find((p) => p.id === q.part)?.label.split(" – ")[0] ?? q.part}</span>
                                {q.audio_url && <span className="text-slate-500">🎧 Có audio</span>}
                                {q.image_url && <span className="text-slate-500">🖼 Có hình</span>}
                                <span className="text-emerald-700">Đáp án: {"ABCD"[q.answer]}</span>
                              </div>
                              <p className="line-clamp-2 text-slate-800">{q.question}</p>
                            </div>
                            <button onClick={() => removeQuestion(q.id)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Xóa câu hỏi">
                              <Icon name="trash" className="h-4 w-4" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {shownQuestions.length > 100 && <p className="mt-3 text-center text-xs text-slate-500">Đang hiện 100 câu mới nhất trong {shownQuestions.length} câu.</p>}
                  </Card>
                </>
              )}

              {/* ===== KẾT QUẢ ===== */}
              {view === "results" && (
                <>
                  {filterBar}
                  <Card title="Kết quả làm bài của học viên" icon="chart">
                    <ResultTable rows={scope.at.slice(0, 100)} students={studentMap} classMap={classMap} />
                  </Card>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {toast && <div className="fixed bottom-6 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-xl bg-[#0B1F4B] px-5 py-3 text-sm text-white shadow-lg">{toast}</div>}
    </div>
  );
}