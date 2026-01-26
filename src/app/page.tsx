"use client";

//import { useUser } from "@/context/UserContext";
import { db } from "@/firebase";
import { useRouter } from "next/navigation";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { doc, getDoc } from "firebase/firestore";

import { useEffect, useState } from "react";

export default function FrontPage() {
  const router = useRouter();

  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [validCode, setValidCode] = useState(false);

  useEffect(() => {
    setChecking(true);
    const checkCode = async () => {
      if (code.length === 0) {
        setChecking(false);
        return;
      }
      const docRef = doc(db, "meetings", code);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setChecking(false);
        setValidCode(true);
      } else {
        setChecking(false);
        setValidCode(false);
      }
    }
    checkCode();
  }, [code]);

  return (
    <div className="flex justify-center items-center flex-col w-full text-foreground bg-background min-h-screen gap-4">
      <div className={'flex justify-center items-center flex-col w-full text-foreground bg-background min-h-screen gap-4 w-3/4 lg:w-1/4 '}>
        Liity kokoukseen antamalla koodi
        <Input
          className="font-mono"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Kokouskoodi"
        />
        <Button
          isDisabled={code.length === 0 || !validCode}
          isLoading={checking}
          onPress={() => router.push(`/m/${code}`)}
        >
          Liity kokoukseen
        </Button>
        <p>tai luo uusi kokous:</p>
        <Button
          onPress={() => router.push('/new')}
        >
          Uusi kokous
        </Button>
      </div>
    </div>
  );
}
