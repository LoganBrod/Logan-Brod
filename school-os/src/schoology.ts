// Minimal Schoology REST client using the user-level consumer key and secret
// from Schoology → your name → API. Those act as you, two-legged OAuth 1.0a,
// PLAINTEXT signature over HTTPS. No token dance.
import crypto from "node:crypto";

const BASE = "https://api.schoology.com/v1";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env`);
  return v;
}

function authHeader(): string {
  const key = required("SCHOOLOGY_CONSUMER_KEY");
  const secret = required("SCHOOLOGY_CONSUMER_SECRET");
  const parts = {
    realm: "Schoology API",
    oauth_consumer_key: key,
    oauth_token: "",
    oauth_nonce: crypto.randomBytes(8).toString("hex"),
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_signature_method: "PLAINTEXT",
    oauth_version: "1.0",
    oauth_signature: encodeURIComponent(`${secret}&`),
  };
  return "OAuth " + Object.entries(parts).map(([k, v]) => `${k}="${v}"`).join(",");
}

/** GET a path like "users/me" or a full URL. Follows Schoology's 303 on users/me. */
export async function sget<T = unknown>(pathOrUrl: string): Promise<T> {
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${BASE}/${pathOrUrl}`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
    redirect: "manual",
  });
  if (res.status === 303 || res.status === 301 || res.status === 302) {
    const next = res.headers.get("location");
    if (!next) throw new Error(`Schoology redirected ${url} with no Location header`);
    return sget<T>(next);
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Schoology ${res.status} on ${url}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export type Me = { uid: string; name_display: string; school_id: string };

export type Section = {
  id: string;
  course_title: string;
  section_title: string;
  active?: number;
};

export type Assignment = {
  id: string;
  title: string;
  description?: string;
  due?: string; // "2026-10-14 23:59:00"
  type?: string; // "assignment" | "assessment" | "discussion"
  web_url?: string;
  grading_category?: string;
};

export type Event = {
  id: string;
  title: string;
  description?: string;
  start: string; // "2026-10-14 08:00:00"
  type?: string;
  web_url?: string;
};

export async function me(): Promise<Me> {
  return sget<Me>("users/me");
}

export async function mySections(uid: string): Promise<Section[]> {
  const data = await sget<{ section: Section[] }>(`users/${uid}/sections`);
  return (data.section ?? []).filter((s) => s.active !== 0);
}

export async function sectionAssignments(sectionId: string): Promise<Assignment[]> {
  const data = await sget<{ assignment: Assignment[] }>(`sections/${sectionId}/assignments?start=0&limit=200`);
  return data.assignment ?? [];
}

export async function sectionEvents(sectionId: string): Promise<Event[]> {
  const data = await sget<{ event: Event[] }>(`sections/${sectionId}/events?start=0&limit=200`);
  return data.event ?? [];
}

// ---- Materials and attachments ----

export type Attachment = {
  id: string;
  title?: string;
  filename?: string;
  filesize?: number;
  download_path?: string;
  timestamp?: number;
};

type Attachments = { files?: { file?: Attachment[] } };

export type Doc = { id: string; title: string; attachments?: Attachments };
export type AssignmentDetail = Assignment & { attachments?: Attachments };

/** Files posted under a section's Materials → Documents. */
export async function sectionDocuments(sectionId: string): Promise<Doc[]> {
  const data = await sget<{ document: Doc[] }>(`sections/${sectionId}/documents?start=0&limit=200`);
  return data.document ?? [];
}

/** One assignment with its attachments. The list endpoint often leaves attachments out. */
export async function assignmentDetail(sectionId: string, assignmentId: string): Promise<AssignmentDetail> {
  return sget<AssignmentDetail>(`sections/${sectionId}/assignments/${assignmentId}`);
}

export function filesOf(item: { attachments?: Attachments }): Attachment[] {
  return item.attachments?.files?.file ?? [];
}

/**
 * Downloads an attachment. Schoology answers the signed request with a redirect to
 * plain file storage, which must be fetched WITHOUT the OAuth header.
 */
export async function downloadAttachment(downloadPath: string): Promise<Buffer> {
  const first = await fetch(downloadPath, { headers: { Authorization: authHeader() }, redirect: "manual" });
  let res = first;
  if (first.status >= 300 && first.status < 400) {
    const next = first.headers.get("location");
    if (!next) throw new Error(`download of ${downloadPath} redirected with no Location`);
    res = await fetch(next);
  }
  if (!res.ok) throw new Error(`download ${res.status} for ${downloadPath}`);
  return Buffer.from(await res.arrayBuffer());
}

// ---- grades: what the student can see of their own marks ----
export type GradeItem = { assignment_id: number | string; grade: string | number | null; max_points?: number | string; exception?: number; comment?: string; timestamp?: number };
export type GradePeriod = { period_id: number | string; period_title?: string; assignment: GradeItem[]; final_grade?: { grade?: number | string; weight?: number }[] };
export type GradeSection = { section_id: number | string; period: GradePeriod[]; final_grade?: { grade?: number | string; period_id?: number | string }[] };

/** Every grade Schoology will show this user. A student's own key normally sees their own; 403 means it is off for this school. */
export async function myGrades(uid: string, sectionId?: string): Promise<GradeSection[]> {
  const data = await sget<{ section?: GradeSection[] }>(`users/${uid}/grades${sectionId ? `?section_id=${sectionId}` : ""}`);
  return data.section ?? [];
}

