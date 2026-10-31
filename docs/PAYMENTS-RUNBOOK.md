# Payments runbook

For the treasurer. The book collects the form. Stripe collects the card, through the ticket's Payment Link. There is no webhook. The book does not know a payment happened until someone records it here.

Read with `docs/PAYMENTS.md` (Current model) and `docs/HOSTING.md`.

## Before opening

Each paid ticket needs a Stripe Payment Link whose price equals the price in the book. An admin pastes that link into the ticket. An editor cannot.

Prove the path once, with a chapter card: buy one ticket, find the payment in Stripe, press Mark paid in the book, then refund it in Stripe and cancel it on the desk. After that, an admin may turn registration on for the event. The host flag `BOOK_REGISTRATION` must already be `on` on Production, and both spam-check keys must be set.

## Every day while registration is open

In Stripe, open Payments. For each new payment, find the registration code. The Payment Link carries it as `client_reference_id`.

In the book, open the event's Registrations and find that code. Press Mark paid. Enter the amount and the payment ID (`pi_...`). Add a note if it helps.

If the amount is not the registration total, the book asks you to confirm before it records the payment.

## Unpaid after the hold

A paid registration holds its seats for the event's hold (72 hours unless the page says otherwise). When the hold has passed, press "Release lapsed holds". That frees the seats.

If the payment arrives after the release, contact the person. Either refund that payment in Stripe, or have an editor register them again and then mark that new registration paid.

## Paid twice

Refund the extra payment in Stripe. Note it on the registration.

## Refunds

Refund in Stripe first. Then, on the desk, press "Refunded in Stripe — cancel" and enter the refund ID (`re_...`). The book records the net amount already marked paid, and cancels the registration.

## Price changes

Only an admin can change a ticket's price or its payment link. Do not change the price while anyone is still awaiting payment at the current price. Change the Stripe Payment Link first, so the new link's price matches the new price in the book, then save the ticket and type the new price to confirm.

## Weekly, and after the event

The book's paid total for the event should equal Stripe's net for that event's Payment Links. List any difference, with the registration code and the Stripe payment, and resolve it before the books close.
