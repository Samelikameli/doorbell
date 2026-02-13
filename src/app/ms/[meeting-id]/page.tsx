"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    Button,
    DateField,
    DateInputGroup,
    Description,
    Input,
    Label,
    Switch,
    TextField,
} from "@heroui/react";
import { getLocalTimeZone, now, type DateValue, ZonedDateTime } from "@internationalized/date";
import { I18nProvider } from "@react-aria/i18n";
import Image from "next/image";
import { useUser } from "@/context/UserContext";
import { useMeeting } from "@/hooks/useMeeting";
import { db } from "@/firebase";

import {
    collection,
    deleteDoc,
    doc,
    onSnapshot,
    serverTimestamp,
    setDoc,
    updateDoc,
    type DocumentData,
} from "firebase/firestore";

import type { Meeting, SpeechType } from "@/types";
import { SPEECH_TYPE_ICON } from "@/utils";

type AvailableSpeechType = SpeechType & { enabledByDefault: boolean };

function toZonedDateTime(v: any): ZonedDateTime | null {
    const d: Date | null =
        v == null
            ? null
            : v instanceof Date
                ? v
                : typeof v?.toDate === "function"
                    ? v.toDate()
                    : typeof v === "string"
                        ? (() => {
                            const dd = new Date(v);
                            return Number.isNaN(dd.getTime()) ? null : dd;
                        })()
                        : null;

    if (!d) return null;

    // Convert JS Date -> ZonedDateTime in local zone
    // Use `now()` as a base and set fields to avoid timezone mistakes.
    const tz = getLocalTimeZone();
    const base = now(tz);

    return base
        .set({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() })
        .set({ hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds(), millisecond: d.getMilliseconds() });
}

export default function MeetingSettingsPage() {
    const { user, loading: userLoading } = useUser();
    const router = useRouter();
    const params = useParams();

    const meetingCode = params["meeting-id"] as string | undefined;

    const { meeting, loading: meetingLoading, error: meetingError, exists } = useMeeting(meetingCode);

    useEffect(() => {
        if (!userLoading && user && user.isAnonymous) {
            router.push(`/login?redirect=/ms/${meetingCode ?? ""}`);
        }
    }, [user, userLoading, router, meetingCode]);

    const [admins, setAdmins] = useState<Array<{ id: string; uid: string; name?: string }>>([]);
    const [participants, setParticipants] = useState<Array<{ id: string; uid: string; name?: string }>>([]);
    const [membersError, setMembersError] = useState<string>("");

    const [availableSpeechTypes, setAvailableSpeechTypes] = useState<AvailableSpeechType[]>([]);
    const [enabledSpeechTypeIds, setEnabledSpeechTypeIds] = useState<Set<string>>(new Set());
    const [speechTypesError, setSpeechTypesError] = useState<string>("");

    const [name, setName] = useState("");
    const [startsAt, setStartsAt] = useState<ZonedDateTime | null>(null);
    const [isPublic, setIsPublic] = useState(false);
    const [requireLogin, setRequireLogin] = useState(false);
    const [defaultSpeechType, setDefaultSpeechType] = useState("");

    const [saving, setSaving] = useState(false);
    const [saveErr, setSaveErr] = useState<string>("");
    const [saveOk, setSaveOk] = useState<string>("");

    useEffect(() => {
        if (!meeting) return;

        setName(meeting.name ?? "");
        setIsPublic(Boolean(meeting.isPublic));
        setRequireLogin(Boolean(meeting.requireLogin));
        setDefaultSpeechType(meeting.defaultSpeechType ?? "");

        // meeting.startsAt may be Date | Timestamp | string depending on legacy data
        setStartsAt(toZonedDateTime((meeting as any).startsAt));
    }, [meeting]);

    useEffect(() => {
        if (!meetingCode) return;

        setMembersError("");

        const adminsRef = collection(db, "meetings", meetingCode, "meetingAdmins");
        const participantsRef = collection(db, "meetings", meetingCode, "participants");

        const unsubAdmins = onSnapshot(
            adminsRef,
            (snap) => {
                const list = snap.docs.map((d) => {
                    const data = d.data() as any;
                    return {
                        id: d.id,
                        uid: String(data.uid ?? d.id),
                        name: typeof data.name === "string" ? data.name : undefined,
                    };
                });
                setAdmins(list.sort((a, b) => a.uid.localeCompare(b.uid)));
            },
            (e) => setMembersError(String((e as any)?.message ?? e))
        );

        const unsubParticipants = onSnapshot(
            participantsRef,
            (snap) => {
                const list = snap.docs.map((d) => {
                    const data = d.data() as any;
                    return {
                        id: d.id,
                        uid: String(data.uid ?? d.id),
                        name: typeof data.name === "string" ? data.name : undefined,
                    };
                });
                setParticipants(list.sort((a, b) => a.uid.localeCompare(b.uid)));
            },
            (e) => setMembersError(String((e as any)?.message ?? e))
        );

        return () => {
            unsubAdmins();
            unsubParticipants();
        };
    }, [meetingCode]);

    useEffect(() => {
        setSpeechTypesError("");

        const ref = doc(db, "settings", "availableSpeechTypes");
        const unsub = onSnapshot(
            ref,
            (snap) => {
                const data = (snap.data() ?? {}) as DocumentData;
                const arr = Array.isArray(data.speechTypes) ? data.speechTypes : [];
                const parsed: AvailableSpeechType[] = arr
                    .map((x: any) => ({
                        id: String(x?.id ?? ""),
                        label: String(x?.label ?? ""),
                        priority: Number(x?.priority ?? 0),
                        icon: String(x?.icon ?? ""),
                        enabledByDefault: Boolean(x?.enabledByDefault ?? false),
                    }))
                    .filter((x) => x.id.length > 0);

                parsed.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || a.label.localeCompare(b.label));
                setAvailableSpeechTypes(parsed);
            },
            (e) => setSpeechTypesError(String((e as any)?.message ?? e))
        );

        return () => unsub();
    }, []);

    useEffect(() => {
        if (!meetingCode) return;

        setSpeechTypesError("");

        const ref = collection(db, "meetings", meetingCode, "speechTypes");
        const unsub = onSnapshot(
            ref,
            (snap) => {
                const ids = new Set<string>();
                snap.docs.forEach((d) => ids.add(d.id));
                setEnabledSpeechTypeIds(ids);
            },
            (e) => setSpeechTypesError(String((e as any)?.message ?? e))
        );

        return () => unsub();
    }, [meetingCode]);

    async function saveMeeting() {
        if (!meetingCode) return;

        setSaving(true);
        setSaveErr("");
        setSaveOk("");

        try {
            const ref = doc(db, "meetings", meetingCode);

            await updateDoc(ref, {
                name: name.trim(),
                startsAt: startsAt ? startsAt.toDate().toISOString() : null,
                isPublic: Boolean(isPublic),
                requireLogin: Boolean(requireLogin),
                defaultSpeechType: String(defaultSpeechType ?? ""),
                updatedAt: serverTimestamp(),
                updatedBy: user?.uid ?? null,
            });

            setSaveOk("Tallennettu.");
            window.setTimeout(() => setSaveOk(""), 2500);
        } catch (e: any) {
            setSaveErr(String(e?.message ?? e));
        } finally {
            setSaving(false);
        }
    }

    async function toggleSpeechType(st: AvailableSpeechType, nextEnabled: boolean) {
        if (!meetingCode) return;

        setSpeechTypesError("");

        try {
            const ref = doc(db, "meetings", meetingCode, "speechTypes", st.id);

            if (nextEnabled) {
                await setDoc(
                    ref,
                    {
                        id: st.id,
                        label: st.label,
                        priority: st.priority,
                        icon: st.icon,
                        enabledByDefault: Boolean(st.enabledByDefault),
                        updatedAt: serverTimestamp(),
                    },
                    { merge: true }
                );
            } else {
                await deleteDoc(ref);
            }
        } catch (e: any) {
            setSpeechTypesError(String(e?.message ?? e));
        }
    }

    if (!meetingCode) {
        return (
            <div className="h-dvh flex items-center justify-center">
                <p className="text-sm opacity-70">Puuttuva kokouksen tunniste.</p>
            </div>
        );
    }

    return (
        <div className="h-dvh flex flex-col bg-background text-foreground overflow-hidden">
            <div className="flex flex-row px-4 py-3 border-b border-border shrink-0 gap-4 items-center justify-between">
                <div>Oma profiili &gt; {meetingCode} &gt; asetukset</div>
                <Button size="sm" variant="outline" onPress={() => router.push(`/meetings/${meetingCode}`)}>
                    Takaisin
                </Button>
            </div>

            <div className="flex flex-1 min-w-0 min-h-0 flex-col border border-border overflow-hidden">
                <div className="flex flex-col p-4 gap-4 overflow-auto">
                    {/* Meeting settings */}
                    <div className="w-full max-w-2xl border border-border rounded p-4">
                        <div className="font-semibold mb-2">Kokouksen asetukset</div>

                        {meetingLoading && <p className="text-sm opacity-70">Ladataan…</p>}

                        {!meetingLoading && meetingError && (
                            <p className="text-sm text-danger">{String((meetingError as any)?.message ?? meetingError)}</p>
                        )}

                        {!meetingLoading && !exists && <p className="text-sm text-danger">Kokousta ei löytynyt.</p>}

                        {!meetingLoading && meeting && (
                            <div className="flex flex-col gap-4">
                                <TextField name="meetingCode" onChange={() => { }}>
                                    <Label>Kokouksen koodi</Label>
                                    <Input value={meeting.code} readOnly placeholder="-" />
                                    <Description>Ei muokattavissa.</Description>
                                </TextField>

                                <TextField name="name" onChange={setName}>
                                    <Label>Nimi</Label>
                                    <Input value={name} placeholder="Kokouksen nimi" />
                                    <Description>Esitetään osallistujille.</Description>
                                </TextField>

                                <I18nProvider locale="fi-FI">
                                    <DateField
                                        hourCycle={24}
                                        value={startsAt ?? undefined}
                                        defaultValue={now(getLocalTimeZone())}
                                        onChange={(v: DateValue | null) => {
                                            // DateField can emit other DateValue types; we only store ZonedDateTime
                                            setStartsAt(v ? (v as ZonedDateTime) : null);
                                        }}
                                    >
                                        <Label>Alkaa</Label>
                                        <DateInputGroup>
                                            <DateInputGroup.Input>
                                                {(segment) => {
                                                    if (segment.text === "/") {
                                                        const { text: _ignored, ...rest } = segment;
                                                        return <DateInputGroup.Segment segment={{ ...rest, text: "." }} />;
                                                    }
                                                    return <DateInputGroup.Segment segment={segment} />;
                                                }}
                                            </DateInputGroup.Input>
                                        </DateInputGroup>
                                    </DateField>
                                </I18nProvider>

                                <div className="flex flex-col gap-4">
                                    <Switch isSelected={isPublic} onChange={setIsPublic} className="relative">
                                        <Switch.Control>
                                            <Switch.Thumb />
                                        </Switch.Control>
                                        <Label className="text-sm">Julkinen kokous</Label>
                                    </Switch>

                                    <Switch isSelected={requireLogin} onChange={setRequireLogin}>
                                        <Switch.Control>
                                            <Switch.Thumb />
                                        </Switch.Control>
                                        <Label className="text-sm">Vaadi kirjautuminen</Label>
                                    </Switch>
                                </div>

                                <TextField name="defaultSpeechType" onChange={setDefaultSpeechType}>
                                    <Label>Oletuspuhetyyppi (id)</Label>
                                    <Input value={defaultSpeechType} placeholder="esim. DEFAULT" />
                                    <Description>Käytetään uusille puheenvuoroille, jos sovelluksessa ei valita erikseen.</Description>
                                </TextField>

                                <div className="flex items-center gap-3">
                                    <Button onPress={saveMeeting} isDisabled={saving} isPending={saving}>
                                        Tallenna
                                    </Button>
                                    {saveOk ? <span className="text-sm opacity-70">{saveOk}</span> : null}
                                    {saveErr ? <span className="text-sm text-danger">{saveErr}</span> : null}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Admins and participants */}
                    <div className="w-full max-w-2xl border border-border rounded p-4">
                        <div className="font-semibold mb-2">Käyttäjät</div>

                        {membersError ? <p className="text-sm text-danger">{membersError}</p> : null}

                        <div className="flex flex-col gap-4">
                            <div>
                                <div className="font-medium mb-1">Ylläpitäjät</div>
                                {admins.length === 0 ? (
                                    <p className="text-sm opacity-70">Ei ylläpitäjiä.</p>
                                ) : (
                                    <ul className="text-sm space-y-1">
                                        {admins.map((a) => (
                                            <li key={a.id} className="flex items-center justify-between">
                                                <span className="truncate">{a.name ? `${a.name} (${a.uid})` : a.uid}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            <div>
                                <div className="font-medium mb-1">Osallistujat</div>
                                {participants.length === 0 ? (
                                    <p className="text-sm opacity-70">Ei osallistujia.</p>
                                ) : (
                                    <ul className="text-sm space-y-1">
                                        {participants.map((p) => (
                                            <li key={p.id} className="flex items-center justify-between">
                                                <span className="truncate">{p.name ? `${p.name} (${p.uid})` : p.uid}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Speech types */}
                    <div className="w-full max-w-2xl border border-border rounded p-4">
                        <div className="font-semibold mb-2">Puhetyypit</div>

                        {speechTypesError ? <p className="text-sm text-danger">{speechTypesError}</p> : null}

                        {availableSpeechTypes.length === 0 ? (
                            <p className="text-sm opacity-70">Ei saatavilla olevia puhetyyppejä.</p>
                        ) : (
                            <ul className="text-sm space-y-3">
                                {availableSpeechTypes.map((st) => {
                                    const enabled = enabledSpeechTypeIds.has(st.id);

                                    return (
                                        <li key={st.id} className="flex items-center justify-between gap-3 border-b border-border pb-3">
                                            <div className="flex flex-row gap-3">
                                                {SPEECH_TYPE_ICON[st.icon] && (
                                                    <Image
                                                        src={SPEECH_TYPE_ICON[st.icon]}
                                                        alt={`${st.label} ikoni`}
                                                        width={32}
                                                        height={32}
                                                        className="flex-shrink-0"
                                                    />
                                                )}
                                                <div className="min-w-0">
                                                    <div className="font-medium truncate">
                                                        {st.label} <span className="opacity-70">({st.id})</span>
                                                    </div>
                                                    <div className="text-xs opacity-70">
                                                        prioriteetti: {st.priority} · ikoni: {st.icon} · oletus: {st.enabledByDefault ? "kyllä" : "ei"}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-2">
                                                <Switch isSelected={enabled} onChange={(v) => toggleSpeechType(st, Boolean(v))} className="relative">
                                                    <Switch.Control>
                                                        <Switch.Thumb />
                                                    </Switch.Control>
                                                    <Label className="text-sm">{enabled ? "Käytössä" : "Ei käytössä"}</Label>
                                                </Switch>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
