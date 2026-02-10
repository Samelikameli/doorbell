import Image from "next/image";
import React, { useMemo, useState } from "react";
import { Proposal, ProposalCloseReason } from "@/types";
import { Button, Checkbox, Form, Input, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Tooltip, useDisclosure } from "@heroui/react";
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
  console.log(proposal.proposerUid, user?.uid, isProposalByMe);

  // Keep draft in sync when proposal updates live
  useMemo(() => {
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
      // Firebase callable errors often have e.code and e.message
      const msg = String(e?.message ?? "Edit failed");
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-row border border-border rounded m-4 p-3">
      <div className="flex-shrink-0 mt-1">
        <Image src={ACTION_ICON["PROPOSAL"]} alt="Ehdotus" width={36} height={36} />
      </div>

      <div className="flex flex-col flex-1 ml-3">
        <p>
          <strong>{proposal.proposerName}</strong> ehdottaa:
        </p>
        <p className="mt-2">{proposal.description}</p>
        <p className="text-sm text-muted mt-2">Tehty {formatDate(proposal.createdAt)}</p>

        <div className="mt-3 flex flex-wrap gap-2 items-center">
          {!proposal.baseProposal && (
            <>
              <Button
                variant="flat"
                onPress={onSupportToggle}
                isDisabled={isClosed || isProposalByMe}
                startContent={<Image src={ACTION_ICON["SUPPORT"]} alt="Kannata" width={24} height={24} />}
              >
                {isSupportedByMe ? "Peru kannatus" : "Kannata"}
              </Button>

              <span className="text-sm opacity-80">Kannatus: {supportCount}</span>
            </>
          )}
          {proposal.baseProposal && (
            <Tooltip content="Pohjaesitys. Esityslistassa ollutta pohjaesitystä ei tarvitse kannattaa, ja se muodostuu kokouksen päätökseksi, jos muita ehdotuksia ei ole." placement="top">
              <Image src={ACTION_ICON["BASE_PROPOSAL"]} alt="Pohjaesitys" width={24} height={24} />
            </Tooltip>
          )}
          {/* Edit: allow admin (or proposer if you later allow it) */}
          {isMeetingAdmin && isProposalByMe && (
            <Button
              variant="flat"
              onPress={() => {
                setDraft(proposal.description ?? "");
                setError("");
                onOpen();
              }}
              isDisabled={isClosed}
              startContent={<Image src={ACTION_ICON["EDIT"]} alt="Muokkaa" width={24} height={24} />}
            >
              Muokkaa
            </Button>
          )}

          {isMeetingAdmin && (
            <>
              <Button color="danger" variant="flat" onPress={() => onClose(proposal.id, 'ACCEPTED')} isDisabled={isClosed}>
                Sulje hyväksyttynä
              </Button>
              <Button color="danger" variant="flat" onPress={() => onClose(proposal.id, 'REJECTED')} isDisabled={isClosed}>
                Sulje hylättynä
              </Button>
            </>
          )}
        </div>

        {isMeetingAdmin && (
          <div className="mt-3">
            <Checkbox
              isSelected={selectedForDecision}
              onValueChange={(selected) => onToggleSelectedForDecision(proposal.id, selected)}
              isDisabled={isClosed}
            >
              Valitse äänestykseen
            </Checkbox>
          </div>
        )}

        <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
          <ModalContent>
            {(close) => (
              <>
                <ModalHeader className="flex flex-col gap-1">Muokkaa ehdotusta</ModalHeader>
                <ModalBody>
                  <div className="text-sm opacity-80">
                    Huomio: muokkaus poistaa kaikki kannattajat.
                  </div>
                  {proposal.baseProposal && <span className="font-bold">Pohjaesitys. Älä muokkaa pohjaesityksen sisältöä, vain muotoilua. Tee tarvittaessa uusi ehdotus muutoksesta.</span>}

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

                  {error && (
                    <div className="text-sm text-danger">
                      {error}
                    </div>
                  )}
                </ModalBody>
                <ModalFooter>
                  <Button variant="light" onPress={close} isDisabled={saving}>
                    Peruuta
                  </Button>
                  <Button color="primary" type="submit" form={`editProposalForm:${proposal.id}`} isDisabled={saving || isClosed}>
                    Tallenna
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>
      </div>
    </div>
  );
}
