import Image from "next/image";
import React, { useEffect, useMemo, useState } from "react";
import { Proposal, ProposalCloseReason } from "@/types";
import {
  Button,
  Checkbox,
  Chip,
  Form,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Tooltip,
  useDisclosure,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/react";
import { formatDate } from "@/utils";
import { ACTION_ICON } from "@/utils";
import { User } from "firebase/auth";

export function ProposalCard({
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
  const { isOpen, onOpen, onOpenChange } = useDisclosure();

  const [draft, setDraft] = useState(proposal.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");

  const isClosed = proposal.open === false;
  const isSupportedByMe = proposal.supporterUids?.includes(user?.uid ?? "") ?? false;
  const isProposalByMe = proposal.proposerUid === user?.uid;

  // Keep draft in sync when proposal updates live
  useEffect(() => {
    setDraft(proposal.description ?? "");
    setError("");
  }, [proposal.description]);

  const submitEdit = async (close: () => void) => {
    const next = draft.trim();
    if (!next) return;

    setSaving(true);
    setError("");

    try {
      await onEdit(proposal.id, next);
      close();
    } catch (e: any) {
      setError(String(e?.message ?? "Edit failed"));
    } finally {
      setSaving(false);
    }
  };

  const createdLabel = useMemo(() => formatDate(proposal.createdAt), [proposal.createdAt]);

  return (
    <div
      className={[
        "border border-border rounded-lg mx-4 my-3 p-3",
        "bg-background",
        isClosed ? "opacity-80" : "",
      ].join(" ")}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <Image src={ACTION_ICON["PROPOSAL"]} alt="Ehdotus" width={34} height={34} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold break-words">
                  {proposal.proposerName}
                </span>
                <span className="text-sm text-foreground/70">ehdottaa</span>

                {proposal.baseProposal && (
                  <Tooltip
                    content="Pohjaesitys. Pohjaesitystä ei tarvitse kannattaa, ja se tulee päätökseksi jos muita ehdotuksia ei ole."
                    placement="top"
                  >
                    <span className="inline-flex items-center gap-1">

                      <Chip variant="flat" color="primary"
                        startContent={<Image
                          src={ACTION_ICON["BASE_PROPOSAL"]}
                          alt="Pohjaesitys"
                          width={18}
                          height={18}
                        />}
                      >
                        Pohjaesitys</Chip>
                    </span>
                  </Tooltip>
                )}

                {isClosed && <Chip variant="flat" color="danger">Suljettu</Chip>}
              </div>

              <div className="text-xs text-foreground/60 mt-1">
                Tehty {createdLabel}
              </div>
            </div>

            {!proposal.baseProposal && (
              <div className="flex-shrink-0 text-xs text-foreground/70">
                <span className="whitespace-nowrap">Kannatus: {supportCount}</span>
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
                    variant="flat"
                    onPress={onSupportToggle}
                    isDisabled={isClosed || isProposalByMe}
                    startContent={
                      <Image src={ACTION_ICON["SUPPORT"]} alt="Kannata" width={18} height={18} />
                    }
                  >
                    {isSupportedByMe ? "Peru kannatus" : "Kannata"}
                  </Button>
                )}

                {isMeetingAdmin && isProposalByMe && (
                  <Button
                    size="sm"
                    variant="flat"
                    onPress={() => {
                      setDraft(proposal.description ?? "");
                      setError("");
                      onOpen();
                    }}
                    isDisabled={isClosed}
                    startContent={<Image src={ACTION_ICON["EDIT"]} alt="Muokkaa" width={18} height={18} />}
                  >
                    Muokkaa
                  </Button>
                )}
              </div>

              {isMeetingAdmin && (
                <div className="flex flex-wrap gap-2 items-center">
                  <Dropdown>
                    <DropdownTrigger>
                      <Button size="sm" variant="flat" color="danger" isDisabled={isClosed}>
                        Sulje
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu aria-label="Sulje ehdotus" disabledKeys={isClosed ? ["accepted", "rejected"] : []}>
                      <DropdownItem
                        key="accepted"
                        onPress={() => onClose(proposal.id, "ACCEPTED")}
                        description="Merkitse hyväksytyksi"
                      >
                        Hyväksytty
                      </DropdownItem>
                      <DropdownItem
                        key="rejected"
                        onPress={() => onClose(proposal.id, "REJECTED")}
                        description="Merkitse hylätyksi"
                      >
                        Hylätty
                      </DropdownItem>
                    </DropdownMenu>
                  </Dropdown>

                </div>
              )}
            </div>

            {isMeetingAdmin && (
              <div className="pt-2 border-t border-border/70">
                <Checkbox
                  isSelected={selectedForDecision}
                  onValueChange={(selected) => onToggleSelectedForDecision(proposal.id, selected)}
                  isDisabled={isClosed}
                >
                  Valitse äänestykseen
                </Checkbox>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit modal */}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent>
          {(close) => (
            <>
              <ModalHeader className="flex flex-col gap-1">Muokkaa ehdotusta</ModalHeader>
              <ModalBody>
                <div className="text-sm text-foreground/80">
                  Huomio: muokkaus poistaa kaikki kannattajat.
                </div>

                {proposal.baseProposal && (
                  <div className="text-sm font-semibold">
                    Pohjaesitys. Älä muuta sisältöä, vain muotoilua. Tee tarvittaessa uusi ehdotus muutoksesta.
                  </div>
                )}

                <Form
                  id={`editProposalForm:${proposal.id}`}
                  onSubmit={(e) => {
                    e.preventDefault();
                    submitEdit(close);
                  }}
                >
                  <Input
                    label="Ehdotuksen sisältö"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    isRequired
                    autoFocus
                    isDisabled={saving}
                  />
                </Form>

                {error && <div className="text-sm text-danger">{error}</div>}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={close} isDisabled={saving}>
                  Peruuta
                </Button>
                <Button
                  color="primary"
                  type="submit"
                  form={`editProposalForm:${proposal.id}`}
                  isDisabled={saving || isClosed}
                >
                  Tallenna
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
