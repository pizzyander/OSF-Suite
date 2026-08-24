// frontend/src/routes/terms.jsx
import { createFileRoute } from "@tanstack/react-router";
import TermsOfUse from "../pages/TermsOfUse";

export const Route = createFileRoute("/terms")({
  component: TermsOfUse,
});