import { z } from "zod";

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
