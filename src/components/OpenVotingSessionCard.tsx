"use client";

import React, { useMemo } from "react";
import { formatDate } from "@/utils";
import { Button, Chip, Tooltip } from "@heroui/react";
import type { VotingSession, HydratedVoteOption } from "@/types";

export function OpenVotingSessionCard({
  session,
  isMeetingAdmin,
  userUid,
  onCastVote,
  onClose,
}: {
  session: VotingSession;
  isMeetingAdmin: boolean;
  userUid: string | null | undefined;
  onCastVote: (votingSessionId: string, voteOptionId: string) => void;
  onClose: (votingSessionId: string) => void;
}) {
  const createdLabel = useMemo(
    () => formatDate(session.createdAt),
    [session.createdAt, formatDate]
  );

  const isPublic = session.votePublicity === "PUBLIC";
  const hasVoted = !!session.hasVoted;

  const selectedOption = isPublic
    ? session.voteOptions.find((o) => o.id === session.myVoteOptionId)
    : undefined;

  const optionLabel = (opt: HydratedVoteOption) => {
    if (opt.type === "PROPOSAL") return opt.proposal?.description ?? opt.label ?? "Ehdotus";
    return opt.label ?? opt.vote;
  };

  return (
    <div className="border border-border rounded-lg mx-4 my-3 p-3 bg-background">
      <div className="min-w-0">
        {/* Header */}
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
                    ? "Äänet ja äänestäjät voidaan näyttää osallistujille sääntöjen mukaan."
                    : "Äänivalintoja ei liitetä äänestäjiin. Näet vain, että olet äänestänyt."}
                </Tooltip.Content>
              </Tooltip>

              {hasVoted && (
                <Chip color="success">
                  <Chip.Label>Äänestetty</Chip.Label>
                </Chip>
              )}
            </div>

            <div className="text-xs text-foreground/60 mt-1">Aloitettu {createdLabel}</div>

            {hasVoted && isPublic && selectedOption && (
              <div className="text-xs text-foreground/70 mt-2">
                Valintasi:{" "}
                <span className="font-semibold break-words">{optionLabel(selectedOption)}</span>
              </div>
            )}

            {hasVoted && !isPublic && (
              <div className="text-xs text-foreground/70 mt-2">Äänesi on yksityinen.</div>
            )}
          </div>

          {isMeetingAdmin && (
            <div className="flex-shrink-0">
              <Button size="sm" variant="outline" onPress={() => onClose(session.votingSessionId)}>
                Sulje äänestys
              </Button>
            </div>
          )}
        </div>

        <ul className="mt-3 space-y-2">
          {session.voteOptions.map((opt) => {
            const label = optionLabel(opt);
            const selected = isPublic && session.myVoteOptionId === opt.id;

            return (
              <li key={opt.id} className="flex items-center justify-between gap-3">
                <span className={selected ? "font-semibold break-words" : "break-words"}>
                  {label}
                </span>

                <Button
                  size="sm"
                  variant={selected ? "primary" : "outline"}
                  isDisabled={!userUid || hasVoted}
                  onPress={() => onCastVote(session.votingSessionId, opt.id)}
                >
                  {selected ? "Valittu" : hasVoted ? "Äänestetty" : "Äänestä"}
                </Button>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 text-sm text-foreground/70">
          {isPublic ? <>Ääniä: {session.votes.length}</> : <>Ääniä: ei näytetä yksityisessä äänestyksessä</>}
        </div>
      </div>
    </div>
  );
}
