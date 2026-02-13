import Image from "next/image";
import React, { useEffect, useMemo, useState } from "react";
import { Proposal, ProposalCloseReason } from "@/types";
import {
  Button,
  Chip,
  Form,
  Input,
  Modal,
  Tooltip,
  Label,
  Dropdown,
  Surface,
  TextField,
  Checkbox,
} from "@heroui/react";
import { formatDate } from "@/utils";
import { ACTION_ICON } from "@/utils";
import { User } from "firebase/auth";

export function OpenProposalCard({
  proposal,
  user,
  isMeetingAdmin,
  selectedForDecision,
  onToggleSelectedForDecision,
  onSupportToggle,
  supportCount,
  onClose,
  onEdit,
}: {
  proposal: Proposal;
  user: User | null;
  isMeetingAdmin: boolean;
  selectedForDecision: boolean;
  onToggleSelectedForDecision: (proposalId: string, selected: boolean) => void;
  onSupportToggle: () => void;
  supportCount: number;
  onClose: (proposalId: string, closedAs: ProposalCloseReason) => void;
  onEdit: (proposalId: string, newDescription: string) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState(proposal.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const isClosed = proposal.open === false;
  const isSupportedByMe = proposal.supporterUids?.includes(user?.uid ?? "") ?? false;
  const isProposalByMe = proposal.proposerUid === user?.uid;

  useEffect(() => {
    setDraft(proposal.description ?? "");
    setError("");
  }, [proposal.description]);

  const submitEdit = async () => {
    const next = draft.trim();
    if (!next) return;

    setSaving(true);
    setError("");

    try {
      await onEdit(proposal.id, next);
    } catch (e: any) {
      setError(String(e?.message ?? "Edit failed"));
    } finally {
      setSaving(false);
    }
  };

  const createdLabel = useMemo(() => formatDate(proposal.createdAt), [proposal.createdAt]);

  const supporterNames = useMemo(() => {
    const names = Array.isArray(proposal.supporterNames) ? proposal.supporterNames : [];
    const cleaned = names.map((n) => (n ?? "").trim()).filter(Boolean);
    return Array.from(new Set(cleaned));
  }, [proposal.supporterNames]);

  const supporterPreview = useMemo(() => {
    if (supporterNames.length === 0) return "";
    const max = 3;
    const head = supporterNames.slice(0, max).join(", ");
    const tail = supporterNames.length > max ? ` +${supporterNames.length - max}` : "";
    return `${head}${tail}`;
  }, [supporterNames]);

  return (
    <div
      className={[
        "border border-border rounded-lg mx-4 my-3 p-3",
        "bg-background",
        isClosed ? "opacity-80" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <Image src={ACTION_ICON["PROPOSAL"]} alt="Ehdotus" width={34} height={34} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold break-words">{proposal.proposerName}</span>
                <span className="text-sm text-foreground/70">ehdottaa</span>

                {proposal.baseProposal && (
                  <Tooltip>
                    <span className="inline-flex items-center gap-1">
                      <Chip color="accent">
                        <Image
                          src={ACTION_ICON["BASE_PROPOSAL"]}
                          alt="Pohjaesitys"
                          width={18}
                          height={18}
                        />
                        <Chip.Label>Pohjaesitys</Chip.Label>
                      </Chip>
                    </span>
                    <Tooltip.Content>
                      Pohjaesitys. Pohjaesitystä ei tarvitse kannattaa, ja se tulee päätökseksi jos muita ehdotuksia ei ole.
                    </Tooltip.Content>
                  </Tooltip>
                )}

                {isClosed && (
                  <Chip color="danger">
                    <Chip.Label>Suljettu</Chip.Label>
                  </Chip>
                )}
              </div>

              <div className="text-xs text-foreground/60 mt-1">Tehty {createdLabel}</div>
            </div>

            {!proposal.baseProposal && (
              <div className="flex-shrink-0 text-xs text-foreground/70 flex flex-col items-end gap-1">
                <span className="whitespace-nowrap">Kannatus: {supportCount}</span>

                {supporterNames.length > 0 && (
                  <Tooltip>
                    <span className="whitespace-nowrap">
                      <span className="text-foreground/60">Kannattajat:</span>{" "}
                      <span className="font-medium">{supporterPreview}</span>
                    </span>
                    <Tooltip.Content>
                      <div className="max-w-sm">
                        <div className="font-semibold mb-1">Kannattajat</div>
                        <div className="text-sm whitespace-pre-wrap break-words">
                          {supporterNames.join(", ")}
                        </div>
                      </div>
                    </Tooltip.Content>
                  </Tooltip>
                )}
              </div>
            )}
          </div>

          <div className="mt-3 text-sm whitespace-pre-wrap break-words leading-relaxed">
            {proposal.description}
          </div>

          <div className="flex flex-col gap-2 mt-4">
            <div className="mt-4 flex flex-row gap-2">
              <div className="flex flex-wrap gap-2 items-center">
                {!proposal.baseProposal && (
                  <Button
                    size="sm"
                    variant="outline"
                    onPress={onSupportToggle}
                    isDisabled={isClosed || isProposalByMe}
                  >
                    <Image src={ACTION_ICON["SUPPORT"]} alt="Kannata" width={18} height={18} />
                    {isSupportedByMe ? "Peru kannatus" : "Kannata"}
                  </Button>
                )}
                {isMeetingAdmin && isProposalByMe && (
                  <Button
                    size="sm"
                    variant="outline"
                    onPress={() => {
                      setDraft(proposal.description ?? "");
                      setError("");
                      setIsEditModalOpen(true);
                    }}
                    isDisabled={isClosed}
                  >
                    <Image src={ACTION_ICON["EDIT"]} alt="Muokkaa" width={18} height={18} />
                    Muokkaa
                  </Button>
                )}
              </div>

              {isMeetingAdmin && (
                <div className="flex flex-wrap gap-2 items-center">
                  <Dropdown>
                    <Dropdown.Trigger>
                      <span className="button button--md button--danger-soft">Sulje</span>
                    </Dropdown.Trigger>
                    <Dropdown.Popover>
                      <Dropdown.Menu
                        aria-label="Sulje ehdotus"
                        disabledKeys={isClosed ? ["accepted", "rejected"] : []}
                      >
                        <Dropdown.Item
                          key="accepted"
                          onPress={() => onClose(proposal.id, "ACCEPTED")}
                          textValue="Merkitse hyväksytyksi"
                        >
                          Hyväksytty
                        </Dropdown.Item>
                        <Dropdown.Item
                          key="rejected"
                          onPress={() => onClose(proposal.id, "REJECTED")}
                          textValue="Merkitse hylätyksi"
                        >
                          Hylätty
                        </Dropdown.Item>
                      </Dropdown.Menu>
                    </Dropdown.Popover>
                  </Dropdown>
                </div>
              )}
            </div>

            {isMeetingAdmin && (
              <div className="flex flex-row gap-3 pt-2 border-t border-border/70">
                <Checkbox
                  id={`select-for-decision-${proposal.id}`}
                  isSelected={selectedForDecision}
                  onChange={(isSelected) => onToggleSelectedForDecision(proposal.id, isSelected)}
                  isDisabled={isClosed}
                  variant="secondary"
                  className="relative"
                >
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                </Checkbox>
                <Label htmlFor={`select-for-decision-${proposal.id}`}>Valitse äänestykseen</Label>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal.Backdrop isOpen={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.Header className="flex flex-col gap-1">
              <Modal.Heading>Muokkaa ehdotusta</Modal.Heading>
            </Modal.Header>

            <Modal.Body className="p-4">
              <Surface>
                <div className="text-sm text-foreground/80">Huomio: muokkaus poistaa kaikki kannattajat.</div>

                {proposal.baseProposal && (
                  <div className="text-sm font-semibold">
                    Pohjaesitys. Älä muuta sisältöä, vain muotoilua. Tee tarvittaessa uusi ehdotus
                    muutoksesta.
                  </div>
                )}

                <Form
                  id={`editProposalForm:${proposal.id}`}
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitEdit();
                    setIsEditModalOpen(false);
                  }}
                >
                  <TextField>
                    <Label htmlFor={`editProposalForm:${proposal.id}:description`}>Ehdotuksen sisältö</Label>
                    <Input
                      id={`editProposalForm:${proposal.id}:description`}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      required
                      autoFocus
                      disabled={saving}
                    />
                  </TextField>
                </Form>

                {error && <div className="text-sm text-danger">{error}</div>}
              </Surface>
            </Modal.Body>

            <Modal.Footer className="flex gap-2 sm:flex-row sm:justify-end">
              <Button className="w-full sm:w-auto" variant="secondary" slot="close" isDisabled={saving}>
                Peruuta
              </Button>
              <Button
                className="w-full sm:w-auto"
                variant="primary"
                type="submit"
                form={`editProposalForm:${proposal.id}`}
                isDisabled={saving || isClosed}
              >
                Tallenna
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}
