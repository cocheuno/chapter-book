import { z } from "zod";
import {
  EMERGENCY_NAME_MAX,
  EMERGENCY_PHONE_MAX,
  GUARDIAN_EMAIL_MAX,
  GUARDIAN_NAME_MAX,
  GUARDIAN_PHONE_MAX,
  MEDICAL_NOTES_MAX,
  RELATIONSHIP_MAX,
  SIGNATURE_MAX,
} from "../payments/consent-rules.ts";

const attendeeInput = z.object({
  givenName: z.string().max(100),
  familyName: z.string().max(100),
  email: z.string().max(200).optional(),
  under18: z.boolean(),
  admissionId: z.string().max(64),
  addOnIds: z.array(z.string().max(64)).max(20),
  badgeAffiliation: z.string().max(200).optional(),
  dietary: z.string().max(500).optional(),
  accessibility: z.string().max(500).optional(),
  consent: z.enum(["now", "later"]).optional(),
  guardianName: z.string().max(GUARDIAN_NAME_MAX).optional(),
  guardianPhone: z.string().max(GUARDIAN_PHONE_MAX).optional(),
  guardianEmail: z.string().max(GUARDIAN_EMAIL_MAX).optional(),
  relationship: z.string().max(RELATIONSHIP_MAX).optional(),
  emergencyName: z.string().max(EMERGENCY_NAME_MAX).optional(),
  emergencyPhone: z.string().max(EMERGENCY_PHONE_MAX).optional(),
  medicalNotes: z.string().max(MEDICAL_NOTES_MAX).optional(),
  photoRelease: z.boolean().optional(),
  agreed: z.boolean().optional(),
  signature: z.string().max(SIGNATURE_MAX).optional(),
});

export const registrationInput = z.object({
  purchaser: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email().max(200),
    phone: z.string().max(40).optional(),
  }),
  attendees: z.array(attendeeInput).max(10),
  acceptedAgreementIds: z.array(z.string().max(64)).max(10),
  newsOptIn: z.boolean(),
  heardFrom: z.string().max(500).optional(),
  utmSource: z.string().max(100).optional(),
  website: z.string().max(200).optional(),
  turnstileToken: z.string().max(4096).optional(),
  slug: z.string().min(1).max(200),
});
