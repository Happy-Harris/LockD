/**
 * The privacy policy and terms (web readiness gap 3). DRAFTS: written from what the code does on the date below, for
 * the owner and a lawyer to review. Every bracketed item is a fact only the owner can supply; the pages show the draft
 * banner until these are final. When behaviour changes (a new service, a new kind of share, account deletion), this
 * file changes in the same PR.
 */
import { HISTORY_PROMISE } from "@/lib/promise";

export const LEGAL_DRAFT_DATE = "2026-10-01";
export const LEGAL_DRAFT_BANNER =
  "DRAFT FOR OWNER AND LAWYER REVIEW. Written from what the app does today; the bracketed items are not settled yet.";

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export const PRIVACY_SECTIONS: LegalSection[] = [
  {
    heading: "Who we are",
    paragraphs: [
      "Lock’d is run by [operator name, address and contact email]. Questions about this policy or your data go there.",
    ],
  },
  {
    heading: "Your log stays on your device",
    paragraphs: [
      "Everything you log is stored in this browser’s storage on this device. Without an account, nothing from your log is sent to us. Clearing this site’s data, or losing the device, deletes it: export a backup from Settings to keep a copy.",
      "Video clips are stored separately on the device and are never uploaded. Your text size setting stays on the device too.",
      "The web receipt reads a Strong or Hevy export in your browser. The file is not uploaded.",
    ],
  },
  {
    heading: "What any website receives",
    paragraphs: [
      "Like any website, our host receives the usual details of each request: your IP address, browser, and the address of the page. [Hosting provider, its location, and how long these logs are kept.] We use no analytics, no advertising and no tracking cookies, and we do not sell data.",
    ],
  },
  {
    heading: "If you sign in",
    paragraphs: [
      "Signing in is optional; logging never needs it. You can sign in with Google, Apple or an email link, where offered. We then store your name, email address and profile picture as the provider gives them, and session records that include the IP address and browser used. Email links are sent through Resend.",
      "Once signed in, your log is copied to our database and kept in sync: exercises, routines, programs, workouts with their sets and notes, body measurements you entered, plates and bars, settings, era names, machine setups, named records, your latest Lab note, and the names and details of your clips (not the videos). Bodyweight and other readings that came from Apple Health or Health Connect stay on the device and are not synced. [Database provider and location.]",
    ],
  },
  {
    heading: "What you choose to share",
    paragraphs: [
      "Your locker is private until you make it public. A public locker shows your display name, handle, bio and a training summary card to anyone.",
      "A share link shows the receipt, moment, year, program or lifetime receipt you chose, to anyone with the link. A session receipt never includes your workout notes. You can unpublish a share from your locker at any time.",
      "A read-only history link lets someone you choose see your sessions and sets (no profile, notes, body measurements, clips, programs or Lab notes) until you revoke it.",
      "Share pages, public lockers and history links ask search engines not to list them. Anyone you send a link to can still copy what they see.",
    ],
  },
  {
    heading: "Ask the Lab",
    paragraphs: [
      "Ask the Lab answers on your device from your log, and sends nothing. Where a written note from a language model is offered to signed-in lifters, pressing it sends a summary of your training (your question, recent sessions and their working sets, your goal lifts and era names, and up to three earlier notes) to xAI to write the note. The question and note are saved to your account. The note is labelled as not computed by Lock’d.",
    ],
  },
  {
    heading: "Crash reports",
    paragraphs: [
      "When a screen fails, a report may be sent to Sentry so we can fix it: the error, the page it happened on (with any share id, handle or link token removed), and your browser and system names. It never includes anything from your log, your email, your account, or the trail of what you did before the error. [Confirm that IP storage is switched off in the Sentry project.]",
    ],
  },
  {
    heading: "Deleting your data",
    paragraphs: [
      "Settings → Delete everything on this device erases the log and its safety copies on this device. It does not yet remove video clips: clearing this site’s data in your browser removes them. Deleting an account and everything synced to it cannot be done in the app yet: until it can, ask us at the contact above and we will delete it. [Response time.]",
    ],
  },
  {
    heading: "Still to be settled",
    paragraphs: [
      "[How long each kind of data is kept; where it is stored and processed; the legal basis for each use; your rights and how to use them; the minimum age; how we tell you about changes to this policy.]",
    ],
  },
];

export const TERMS_SECTIONS: LegalSection[] = [
  {
    heading: "What Lock’d is",
    paragraphs: [
      "Lock’d is a training log. It keeps your record and reads it back: records, estimated maxes, volume, eras and suggested next loads, each derived from what you logged and showing its working.",
    ],
  },
  {
    heading: "Your record is yours",
    paragraphs: [
      HISTORY_PROMISE,
      "You keep ownership of everything you log. If you sign in or share, you give us only the permission needed to store your log, sync it to your devices and show what you chose to share.",
    ],
  },
  {
    heading: "Numbers are estimates, not medical advice",
    paragraphs: [
      "Estimated maxes, suggested loads, verdicts and Lab notes are calculations and suggestions from your own log. They are not medical or coaching advice. Train within your limits, and see a professional about pain or injury.",
    ],
  },
  {
    heading: "Keep a backup",
    paragraphs: [
      "Without an account your log lives only in this browser on this device. Browsers can clear site data. Export a backup regularly; we cannot recover a log that was never synced or backed up.",
    ],
  },
  {
    heading: "Sharing and fair use",
    paragraphs: [
      "Public lockers, share links and history links show what you chose to anyone who has them. Do not use Lock’d to share what is not yours to share, to break the law, or to interfere with the service or other people’s data.",
    ],
  },
  {
    heading: "The service",
    paragraphs: [
      "Lock’d is provided as it is. We work to keep it running and your data safe, but cannot promise it will always be available or free of errors. We may change or stop features; the promise above about your history, charts and export stands.",
    ],
  },
  {
    heading: "Still to be settled",
    paragraphs: ["[Operator and contact; governing law; limits of liability; minimum age; how changes to these terms are announced.]"],
  },
];
