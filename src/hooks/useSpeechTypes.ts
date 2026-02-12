// hooks/useSpeechTypes.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/firebase";
import type { SpeechType } from "@/types";

type UseSpeechTypesResult = {
    speechTypes: SpeechType[];
    defaultSpeechTypeId: string | null;
    loading: boolean;
    error: Error | null;
    getSpeechTypeById: (id: string) => SpeechType;
};

function mapSpeechType(docSnap: any): SpeechType {
    const data = docSnap.data({ serverTimestamps: "estimate" });

    return {
        id: docSnap.id,
        label: data.label ?? docSnap.id,
        priority: typeof data.priority === "number" ? data.priority : 0,
        icon: data.icon ?? "",
    } as SpeechType;
}

export function useSpeechTypes(meetingCode: string | null | undefined): UseSpeechTypesResult {
    const [speechTypes, setSpeechTypes] = useState<SpeechType[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!meetingCode) {
            setSpeechTypes([]);
            setLoading(false);
            setError(null);
            return;
        }

        setLoading(true);
        setError(null);

        const colRef = collection(db, "meetings", meetingCode, "speechTypes");
        // Prefer server-side ordering if you have an index on "priority".
        const q = query(colRef, orderBy("priority", "desc"));

        const unsub = onSnapshot(
            q,
            { includeMetadataChanges: true },
            (qs) => {
                const items: SpeechType[] = [];
                qs.forEach((d) => items.push(mapSpeechType(d)));

                // If priority is missing for some docs, Firestore ordering may put them first/last.
                // Ensure deterministic ordering client-side too.
                items.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

                setSpeechTypes(items);
                setLoading(false);
            },
            (err) => {
                setError(err as Error);
                setLoading(false);
            }
        );

        return () => unsub();
    }, [meetingCode]);

    const defaultSpeechTypeId = speechTypes.length > 0 ? speechTypes[0].id : null;

    const byId = useMemo(() => {
        const m = new Map<string, SpeechType>();
        for (const t of speechTypes) m.set(t.id, t);
        return m;
    }, [speechTypes]);

    const getSpeechTypeById = (id: string): SpeechType => {
        return (
            byId.get(id) ?? {
                id,
                label: id,
                priority: 0,
                icon: "",
            }
        );
    };

    return { speechTypes, defaultSpeechTypeId, loading, error, getSpeechTypeById };
}
