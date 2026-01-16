import { HeroUIProvider } from "@heroui/react";

import React from "react";

import FormClientComponent from "@/components/FormClientComponent";
import Announcements from "@/components/Announcements";

export default async function FormPage() {
  return (
    <HeroUIProvider>
      <FormClientComponent>{<Announcements/>}</FormClientComponent>
    </HeroUIProvider>
  );
}
