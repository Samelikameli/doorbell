import { Proposal, Speech, SpeechType } from "@/types";
import { Button, Checkbox } from "@heroui/react";
import { formatDate, formatDuration } from "@/utils";

export function ProposalCard({
    proposal,
    isMeetingAdmin,
    selectedForDecision,
    onToggleSelectedForDecision,
    onSupportToggle,
    isSupportedByMe,
    supportCount,
    onClose,
}: {
    proposal: Proposal;
    isMeetingAdmin: boolean;
    selectedForDecision: boolean;
    onToggleSelectedForDecision: (proposalId: string, selected: boolean) => void;

    onSupportToggle: (proposalId: string) => void;
    isSupportedByMe: boolean;
    supportCount: number;

    onClose: (proposalId: string) => void;
}) {
    return (
        <div className="border border-border rounded m-4 p-3">
            <p>
                <strong>{proposal.proposerName}</strong> ehdottaa:
            </p>
            <p className="mt-2">{proposal.description}</p>
            <p className="text-sm text-muted mt-2">Tehty {formatDate(proposal.createdAt)}</p>

            <div className="mt-3 flex gap-2 items-center">
                <Button variant="flat" onPress={() => onSupportToggle(proposal.id)}>
                    {isSupportedByMe ? "Peru kannatus" : "Kannata"}
                </Button>
                <span className="text-sm opacity-80">Kannatus: {supportCount}</span>

                {isMeetingAdmin && (
                    <Button color="danger" variant="flat" onPress={() => onClose(proposal.id)}>
                        Sulje
                    </Button>
                )}
            </div>

            {isMeetingAdmin && (
                <div className="mt-3">
                    <Checkbox
                        isSelected={selectedForDecision}
                        onValueChange={(selected) =>
                            onToggleSelectedForDecision(proposal.id, selected)
                        }
                    >
                        Valitse äänestykseen
                    </Checkbox>

                </div>
            )}
        </div>
    );
}
