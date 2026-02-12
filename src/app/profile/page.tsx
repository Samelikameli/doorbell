"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/react";

import { useUser } from "@/context/UserContext";
import { useAdminMeetings } from "@/hooks/useAdminMeetings";

export default function Profile() {
  const { user, loading: userLoading } = useUser();
  const router = useRouter();

  const { meetings, loading, error } = useAdminMeetings(user, userLoading);

  useEffect(() => {
    if (!userLoading && user && user.isAnonymous) {
      router.push("/login?redirect=/profile");
    }
  }, [user, userLoading, router]);

  return (
    <div className="h-dvh flex flex-col bg-background text-foreground overflow-hidden">
      <div className="flex flex-row px-4 py-3 border-b border-border shrink-0 gap-4">
        <div>Oma profiili</div>
      </div>

      <div className="flex flex-1 min-w-0 min-h-0 flex-col border border-border overflow-hidden">
        <div className="flex flex-col p-4 gap-4 overflow-auto">
          <div className="flex flex-row">
            <h1 className="text-2xl font-bold">Kokoukset</h1>
            <Button
              size="sm"
              variant="outline"
              onPress={() => router.push("/new")}
              className="ml-auto"
            >
              Luo uusi kokous
            </Button>
          </div>
          <div className="w-full max-w-2xl border border-border rounded p-4">
            <div className="font-semibold mb-2">
              Kokoukset, joissa olet ylläpitäjä
            </div>

            {loading && (
              <p className="text-sm opacity-70">Ladataan…</p>
            )}

            {error && (
              <p className="text-sm text-danger">{error.message}</p>
            )}

            {!loading && !error && meetings.length === 0 && (
              <p className="text-sm opacity-70">
                Ei ylläpidettäviä kokouksia.
              </p>
            )}

            {!loading && !error && meetings.length > 0 && (
              <ul className="text-sm space-y-2">
                {meetings.map((m) => (
                  <li
                    key={m.code}
                    className="flex items-center justify-between gap-3 border-b border-border pb-2"
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium truncate">
                        {m.name || "(Nimetön kokous)"}
                      </span>

                      <span className="text-xs opacity-70">
                        Koodi: {m.code}
                        {" · "}
                        {m.isPublic ? "Julkinen" : "Yksityinen"}
                        {m.startsAt && (
                          <>
                            {" · "}
                            alkaa{" "}
                            {m.startsAt.toLocaleString("fi-FI")}
                          </>
                        )}
                      </span>
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onPress={() => router.push(`/m/${m.code}`)}
                    >
                      Liity kokoukseen
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
