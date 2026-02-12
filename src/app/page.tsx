"use client";

//import { useUser } from "@/context/UserContext";
import { db } from "@/firebase";
import { useRouter } from "next/navigation";
import { Button, Form, Input, PressEvent, TextField } from "@heroui/react";
import { doc, getDoc } from "firebase/firestore";
import Image from "next/image";
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
        setValidCode(false);
        return;
      }

      try {
        const docRef = doc(db, "meetings", code);
        const docSnap = await getDoc(docRef);

        setValidCode(docSnap.exists());
      } catch (err) {
        // permission-denied or any other error
        setValidCode(false);
      } finally {
        setChecking(false);
      }
    };

    checkCode();
  }, [code]);


  return (
    <div className="flex justify-center items-center flex-col w-full text-foreground bg-background min-h-screen gap-4">
      <div className={'flex justify-center items-center flex-col w-full text-foreground bg-background min-h-screen gap-4 w-3/4 lg:w-1/4 '}>
        <div className="flex flex-row items-center gap-4"><Image src="/icons/proposal.svg" width={64} height={64} alt="Proposal icon" /><p className="text-2xl font-bold">Puheenvuorot.fi</p></div>
        <p>Liity kokoukseen antamalla koodi</p>
        <Form className="flex flex-col justify-center items-center gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/m/${code}`);
          }}
        >
          <TextField>
            <Input
              className="font-mono"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Kokouskoodi"
            />
          </TextField>
          <Button
            type="submit"
            isDisabled={code.length === 0 || !validCode}
            isPending={checking}
          >
            Liity kokoukseen
          </Button>
        </Form>

        <div className="flex flex-col items-center gap-2 mt-4 text-sm text-foreground/70">
          Voit myös siirtyä omille sivuillesi tästä:
          <Button variant="outline" onPress={() => router.push('/profile')}>
            Omat sivut
          </Button>
        </div>
      </div>
    </div>
  );
}
