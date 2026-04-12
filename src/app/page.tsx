"use client";

import { useUser } from "@/context/UserContext";
import { functions } from "@/firebase";
import { httpsCallable } from "@firebase/functions";
import { useRouter } from "next/navigation";

import React from "react";

export default function ButtonPage() {
  const user = useUser();
  const router = useRouter();

  const handleOpenDoor = async () => {
    // call firebase function to open the door
    const openDoor = httpsCallable(functions, 'door');
    try {
      await openDoor({});
      alert("Ovi avattu!");
    } catch (error) {
      console.error("Error opening door: ", error);
      alert("Oven avaaminen epäonnistui.");
    }
  };

  const handleSchedule = async (time: number, uses: number) => {
    // call firebase function to schedule the door opening
    const scheduleDoor = httpsCallable(functions, 'schedule');
    try {
      await scheduleDoor({ time: time * 60, uses });
      alert(`Ovi voidaan avata ${time} minuutin kuluttua, ja se voidaan avata ${uses} kertaa.`);
    } catch (error) {
      console.error("Error scheduling door: ", error);
      alert("Oven aikataulutus epäonnistui.");
    }
  }
  return (
    <div className={`flex justify-center items-center flex-col w-full text-foreground bg-background min-h-screen gap-4`}>

      <button className="text-4xl inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => handleOpenDoor()}>
        Avaa
      </button>
      {/** input fields for time and uses */}
      <div className="flex flex-col gap-2">
        <label htmlFor="time">Aika (minuutteina):</label>
        <input type="number" id="time" defaultValue={60} />
        <label htmlFor="uses">Käyttökerrat:</label>
        <input type="number" id="uses" defaultValue={1} />
      </div>
      <button className="text-4xl inline-flex items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => handleSchedule(Number((document.getElementById("time") as HTMLInputElement).value), Number((document.getElementById("uses") as HTMLInputElement).value))}>
        Aikatauluta
      </button>

      {!user.user && !user.loading &&
        <div className="flex gap-4">
          <button
            color="primary"
            onClick={() => router.push("/login")}
          >
            Kirjaudu sisään
          </button>
        </div>
      }
    </div>
  );
}
