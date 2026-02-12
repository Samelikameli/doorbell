"use client";

import React, { useMemo } from "react";
import { Button, Chip, Tooltip } from "@heroui/react";
import type { VotingSession, HydratedVoteOption, Vote, Voter } from "@/types";
import { formatDate } from "@/utils";

type VoteCounts = Record<string, number>;

function optionLabel(opt: HydratedVoteOption): string {
    if (opt.type === "PROPOSAL") return opt.proposal?.description ?? opt.label ?? "Ehdotus";
    return opt.label ?? opt.vote;
}

function buildCounts(session: VotingSession): VoteCounts {
    const counts: VoteCounts = {};
    for (const opt of session.voteOptions) counts[opt.id] = 0;
    for (const v of session.votes ?? []) {
        counts[v.voteOptionId] = (counts[v.voteOptionId] ?? 0) + 1;
    }
    return counts;
}

function mySelectedLabel(session: VotingSession): string | null {
    const myId = session.myVoteOptionId;
    if (!myId) return null;
    const opt = session.voteOptions.find((o) => o.id === myId);
    return opt ? optionLabel(opt) : null;
}

function rowClass(index: number) {
    // Subtle zebra striping
    const base = "flex items-start justify-between gap-3 px-2 py-1 rounded";
    const zebra = index % 2 === 0 ? "bg-foreground/5" : "bg-transparent";
    return `${base} ${zebra}`;
}

export function ClosedVotingSessionCard({
    session,
    isMeetingAdmin,
    closeProposalsFromVoteResults,
    proposalsCanBeClosedFromVotingResults,
}: {
    session: VotingSession & { voters?: Voter[] };
    isMeetingAdmin: boolean;
    closeProposalsFromVoteResults: (session: VotingSession) => void;
    proposalsCanBeClosedFromVotingResults: boolean;
}) {
    const createdLabel = useMemo(() => formatDate(session.createdAt), [session.createdAt]);
    const closedLabel = useMemo(
        () => (session.closedAt ? formatDate(session.closedAt) : null),
        [session.closedAt]
    );

    const isPublic = session.votePublicity === "PUBLIC";
    const selected = isPublic ? mySelectedLabel(session) : null;

    const counts = useMemo(() => buildCounts(session), [session]);

    const votersByUid = useMemo(() => {
        const map = new Map<string, Voter>();
        const arr = session.voters as Voter[] | undefined;
        if (!arr) return map;
        for (const v of arr) map.set(v.voterUid, v);
        return map;
    }, [session]);

    const renderVoteRow = (v: Vote, index: number) => {
        const voterName =
            v.voterName ??
            (v.voterUid ? votersByUid.get(v.voterUid)?.voterName : undefined) ??
            "Tuntematon";

        const opt = session.voteOptions.find((o) => o.id === v.voteOptionId);
        const label = opt ? optionLabel(opt) : v.voteOptionId;

        return (
            <li key={`${v.voterUid ?? "anon"}:${index}`} className={rowClass(index)}>
                <span className="min-w-0 break-words">
                    <strong>{voterName}</strong>
                </span>
                <span className="text-right break-words">{label}</span>
            </li>
        );
    };

    return (
        <div className="border border-border rounded-lg mx-4 my-3 p-3 bg-background">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold break-words">
                            {session.type === "FOR-AGAINST-ABSTAIN" ? session.label || "Äänestys" : "Äänestys"}
                        </span>

                        <Tooltip>
                            <span>
                                <Chip color={isPublic ? "accent" : "default"}>
                                    <Chip.Label>{isPublic ? "Julkinen" : "Yksityinen"}</Chip.Label>
                                </Chip>
                            </span>
                            <Tooltip.Content>
                                {isPublic
                                    ? "Äänet ja äänestäjät voidaan näyttää päätöksen jälkeen."
                                    : "Äänet näytetään päätöksen jälkeen vain koosteena ilman äänestäjiä."}
                            </Tooltip.Content>
                        </Tooltip>

                        <Chip color="success">
                            <Chip.Label>Päättynyt</Chip.Label>
                        </Chip>
                    </div>

                    <div className="text-xs text-foreground/60 mt-1">
                        Aloitettu {createdLabel}
                        {closedLabel ? ` · Suljettu ${closedLabel}` : ""}
                    </div>

                    {session.hasVoted && (
                        <div className="text-xs text-foreground/70 mt-2">
                            Olet äänestänyt.
                            {isPublic && selected ? (
                                <>
                                    {" "}
                                    Valintasi: <span className="font-semibold">{selected}</span>
                                </>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>
            {isMeetingAdmin && (
                <div className="mt-3">
                    {proposalsCanBeClosedFromVotingResults ? (
                        <Button onClick={() => closeProposalsFromVoteResults(session)}>
                            Sulje ehdotukset äänestyksen tulosten perusteella
                        </Button>
                    ) : (
                        <div className="text-sm text-foreground/60">
                            Ehdotuksia ei voi sulkea automaattisesti tai ne on jo suljettu.
                        </div>)}
                </div>
            )}

            {/* Results */}
            {!isPublic && (
                <div className="mt-4">
                    <h5 className="font-semibold mb-2">Tulos</h5>
                    <ul className="text-sm space-y-1">
                        {session.voteOptions.map((opt, i) => {
                            const label = optionLabel(opt);
                            const c = counts[opt.id] ?? 0;
                            return (
                                <li key={opt.id} className={rowClass(i)}>
                                    <span className="min-w-0 break-words">{label}</span>
                                    <span className="font-semibold">{c}</span>
                                </li>
                            );
                        })}
                    </ul>
                    <div className="mt-2 text-xs text-foreground/60">
                        Ääniä yhteensä: {Object.values(counts).reduce((a, b) => a + b, 0)}
                    </div>
                </div>
            )}

            {isPublic && (
                <div className="mt-4">
                    <h5 className="font-semibold mb-2">Äänet</h5>

                    <div className="mb-2 text-xs text-foreground/60">Ääniä: {session.votes.length}</div>

                    <ul className="text-sm space-y-1">
                        {session.votes.map((v, i) => renderVoteRow(v, i))}
                    </ul>

                    <div className="mt-4">
                        <h6 className="font-semibold mb-2">Tulos</h6>
                        <ul className="text-sm space-y-1">
                            {session.voteOptions.map((opt, i) => {
                                const label = optionLabel(opt);
                                const c = counts[opt.id] ?? 0;
                                return (
                                    <li key={opt.id} className={rowClass(i)}>
                                        <span className="min-w-0 break-words">{label}</span>
                                        <span className="font-semibold">{c}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}
