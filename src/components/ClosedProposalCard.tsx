import { Proposal } from "@/types";
import { formatDate } from "@/utils";


export function ClosedProposalCard({
  proposal,
  isMeetingAdmin,
}: {
  proposal: Proposal;
  isMeetingAdmin: boolean;
}) {
  console.log("Rendering ClosedProposalCard for proposal:", proposal);
  console.log("Proposal closedAt:", proposal.closedAt);
  return (
    <div className="border rounded p-3 mb-3">
      <div className="flex items-center mb-2">
        <h4 className="text-lg font-semibold flex-1">{proposal.description}</h4>
        <span className={`px-2 py-1 text-sm rounded ${proposal.closedAs === "ACCEPTED" ? "bg-green-300 text-green-800" : "bg-red-100 text-red-800"}`}>
          {proposal.closedAs === "ACCEPTED" ? "Hyväksytty" : "Hylätty"}
        </span>
      </div>
      <div className="text-sm text-gray-500">
        Ehdotettu: {formatDate(proposal.createdAt)}
        {proposal.closedAt && (
          <>
            <br />
            Suljettu: {formatDate(proposal.closedAt)}
          </>
        )}
      </div>
    </div>
  );
}
