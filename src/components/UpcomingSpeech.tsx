import { Speech, SpeechType } from "@/types";
import { Button } from "@heroui/react";
import { SpeechAction } from "@/types";
import { formatDate } from "@/utils";


export function UpcomingSpeech({ speech, speechType, isMeetingAdmin, actions, userName, skipAction }: { speech: Speech, speechType: SpeechType, isMeetingAdmin: boolean, actions: SpeechAction[], userName: string, skipAction: () => void }) {

    const s = formatDate(speech.createdAt);

    return (
        <div className="flex flex-row border border-border rounded p-2 mb-2">
            <div className="flex flex-col">
                <p>{speech.ordinal}. <strong>{speech.speakerName}</strong> - {speechType.label}</p>
                <p>{speech.description}</p>
                <p className="text-sm text-muted">Aika: {s}</p>
            </div>
            {isMeetingAdmin && (
                <div className="flex flex-col ml-auto space-y-2">
                    {actions.map((action, index) => (
                        <Button key={index} onPress={action.onPress}>
                            {action.label}
                        </Button>
                    ))}
                </div>
            )}
            {speech.speakerName === userName && skipAction && (
                <div className="flex flex-col ml-auto">
                    <Button onPress={skipAction}>
                        Ohita oma puheenvuoro
                    </Button>
                </div>
            )}
        </div>
    );
}
