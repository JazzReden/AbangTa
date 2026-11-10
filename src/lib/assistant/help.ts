import type { AssistantPlan } from './contracts';

const help = {
  HELP: {
    en: "Hi, I'm Ishi. I can check your unpaid or overdue bills, confirmed collections, available rooms/beds, occupancy and open repairs. I can also explain GCash proofs, cash receipts, deposits, advances, Wi-Fi/parking charges, invitations and reminders. Choose a property above for its report. Try 'Who still owes money?' or 'How do advances work?' I cannot approve payments or change your records.",
    ceb: "Maayong adlaw! Ako si Ishi. Makatabang ko sa pagtan-aw sa wala pa mabayri nga bills, koleksyon, bakanteng kuwarto/kama ug mga repair. Makapasabot usab ko sa GCash proofs, deposito, advance, Wi-Fi/parking ug reminders. Dili ko maka-approve sa bayad o makausab sa inyong records.",
  },
  PAYMENT_HELP: {
    en: 'Tenants submit a GCash reference, amount, payment date and proof from their bill. A pending proof is not a payment: review it against the actual GCash transaction before confirming or declining it. Only confirmed payments reduce the balance and qualify for a receipt. For cash, record the amount actually received in the bill payment form; partial payments leave a remaining balance. Ishi cannot verify money or approve payments for you.',
    ceb: 'Ang tenant mosumite sa GCash reference, kantidad, petsa ug proof sa iyang bill. Ang pending proof dili pa kumpirmadong bayad. Susihon ang tinuod nga GCash transaction una i-confirm o i-decline. Kumpirmadong bayad lamang ang makapakunhod sa balanse ug adunay resibo. Sa cash, i-record lamang ang nadawat; ang kulang magpabiling balanse. Dili ko maka-approve sa bayad para nimo.',
  },
  BILLING_HELP: {
    en: 'Save Wi-Fi and parking defaults in each property. Choose charge separately, included in rent, free or not applicable. Parking is tenant-specific, so enable a charge only for tenants using it. Monthly bills use the tenancy/bed agreed rent plus applicable charges. Metered water/electricity require valid readings and rates. Review the bill computation before generating it; changing defaults does not rewrite existing bills. Bill balances include all charges, so I cannot claim rent-only or electricity-only collections.',
    ceb: 'I-save ang Wi-Fi ug parking defaults sa property: separate charge, included sa abang, free o not applicable. Ang parking charge para lamang sa tenant nga naggamit niini. Ang monthly bill gikan sa agreed rent ug angay nga charges. Kinahanglan husto ang readings ug rates sa metered utilities. Susihon ang computation una mag-generate; dili mausab ang daang bills tungod lang sa bag-ong defaults.',
  },
  FUNDS_HELP: {
    en: 'Deposits are held separately from rent and collections; they do not pay a monthly bill automatically. Record deposit receipts, authorized deductions and refunds in the tenant funds page. Advances are prepaid funds: only the unapplied available advance can be applied to a monthly bill. Applying an advance reduces that bill balance and remaining advance, but is not new cash collected. Never record the same money again as a cash/GCash bill payment.',
    ceb: 'Lahi ang deposito sa abang ug koleksyon; dili kini awtomatikong bayad sa monthly bill. I-record ang deposito, angay nga deduction ug refund sa tenant funds. Ang advance kay daan nang nadawat nga bayad: ang wala pa magamit lamang ang mahimong i-apply sa bill. Mokunhod ang bill ug available advance, apan dili kini bag-ong koleksyon. Ayaw i-record pag-usab isip cash/GCash payment.',
  },
  REMINDER_HELP: {
    en: 'Ask for unpaid or overdue bills, choose a bill, edit the English/Cebuano wording and preview it. Send only after confirming the recipient and message. To schedule, choose a Manila date/time and explicitly enable the one-time schedule. Delivery rechecks the remaining balance, pending proofs and the shared 24-hour tenant cooldown. Paid bills are skipped; pending GCash proofs pause automatic reminders. Check Reminder deliveries to see outcomes or cancel schedules. Delivery is in AbangTa, not SMS or email.',
    ceb: 'Pangayo og unpaid o overdue bills, pilia ang bill ug i-preview ang English/Bisaya reminder. Kumpirmaha ang recipient ug mensahe una ipadala. Para sa schedule, pilia ang Manila date/time ug i-enable ang one-time schedule. Susihon pag-usab ang balanse, pending proof ug 24-hour cooldown. Walay reminder kung bayad na; ihunong sa karon kung adunay pending GCash proof. Sa AbangTa ra ang delivery, dili SMS o email.',
  },
  INVITE_HELP: {
    en: "Open the property's Tenants page and use the room invitation's Copy link, Share or QR code. The tenant creates/signs into their own account and joins using that invitation. Review the join request and room/bed assignment before approving it. An account alone does not grant access to a property; do not share passwords or approve an unfamiliar request.",
    ceb: 'Ablihi ang Tenants page sa property ug gamita ang Copy link, Share o QR code sa room invitation. Ang tenant mogamit sa iyang kaugalingong account aron mo-join. Susihon una ang join request ug room/bed assignment bago i-approve. Ang account lamang dili pa access sa property; ayaw ipaambit ang password o i-approve ang dili kaila nga request.',
  },
};

export function assistantHelp(plan: AssistantPlan): string | null {
  return plan.topic in help ? help[plan.topic as keyof typeof help][plan.language] : null;
}
