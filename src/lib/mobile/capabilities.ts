import "server-only";
import { appleProductPlans, appleSubscriptionsReady } from "@/lib/billing/apple-config";
import { AI_CONSENT_VERSION } from "@/lib/ai-consent";
import { resolveQuoteTextProvider } from "@/lib/llm/quote-text-provider";
import { apnsConfigured } from "@/lib/apns";

export function mobileCapabilities() {
  return {
    apiVersion: 1,
    kits: process.env.KITS_ENABLED === "true",
    consentVersion: AI_CONSENT_VERSION,
    aiText: resolveQuoteTextProvider() !== null,
    voice: Boolean(process.env.OPENAI_API_KEY?.trim()),
    drawingScan: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    planReader: process.env.PLAN_READER_ENABLED === "true" && Boolean(process.env.ANTHROPIC_API_KEY),
    email: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
    serverSMS: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER),
    deposits: process.env.PAYMENTS_ENABLED === "true" && Boolean(process.env.STRIPE_PAYMENTS_WEBHOOK_SECRET),
    push: apnsConfigured(),
    appleSubscriptions: appleSubscriptionsReady(),
    appleProductIDs: appleSubscriptionsReady() ? Object.keys(appleProductPlans()) : [],
    aiDisclosure: {
      version: AI_CONSENT_VERSION,
      processors: ["Anthropic: quote text, transcripts, drawings and supplier documents", "OpenAI: voice recordings and photo analysis"],
      purpose: "Create editable draft quotes and extract the job information you request. Check results before using them.",
      privacyURL: "https://tradies2quote.com/privacy",
    },
  };
}
