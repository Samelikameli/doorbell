"use client";

import React, { useMemo } from "react";
import { formatDate } from "@/utils";
import { Button, Chip, Dropdown, ListBox, Select, Tooltip } from "@heroui/react";
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

  const [selectedVoteOption, setSelectedVoteOption] = React.useState<number | null>(null);

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

              <Dropdown>
                <Button variant="outline" className="font-semibold">Sulje äänestys</Button>
                <Dropdown.Popover className="w-48 p-2">
                  <Button variant="danger" className="w-full" onPress={() => onClose(session.votingSessionId)}>
                    Vahvista sulkeminen
                  </Button>
                </Dropdown.Popover>
              </Dropdown>
            </div>
          )}
        </div>

        <ul className="mt-3 space-y-2">
          {session.voteOptions.map((opt, index) => {
            const label = optionLabel(opt);
            const selected = isPublic && session.myVoteOptionId === opt.id;

            return (
              <li key={opt.id} className="flex items-center justify-between gap-3">
                <span className={selected ? "font-semibold break-words" : "break-words"}>
                  {label}
                </span>
                <Dropdown isOpen={selectedVoteOption === index} onOpenChange={(open) => setSelectedVoteOption(open ? index : null)}>
                  <Button isDisabled={!userUid || hasVoted} variant="outline" className="font-semibold">Äänestä</Button>
                  <Dropdown.Popover placement="left" className="p-2 !w-fit !min-w-0">
                    <div className="inline-flex">
                      <Button
                        size="sm"
                        variant="primary"
                        onPress={() => {
                          onCastVote(session.votingSessionId, opt.id);
                          setSelectedVoteOption(null);
                        }}
                      >
                        {selected ? "Valittu" : hasVoted ? "Äänestetty" : "Äänestä"}
                      </Button>
                    </div>
                  </Dropdown.Popover>
                </Dropdown>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 text-sm text-foreground/70">
          {isPublic ? <>Ääniä: {session.voters?.length}</> : <>Ääniä: ei näytetä yksityisessä äänestyksessä</>}
        </div>
      </div>
    </div>
  );
}
