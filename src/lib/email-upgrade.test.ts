import {beforeEach,afterEach,it,expect,vi} from "vitest";
const transport=vi.hoisted(()=>({send:vi.fn()}));
vi.mock("@/lib/fetchTimeout",()=>({fetchWithTimeout:transport.send,TIMEOUTS:{email:20000}}));
import {sendQuoteEmail} from "./email-quote";
import {sendInvoiceEmail} from "./email-invoice";
import {sendQuoteRequestEmail} from "./email-request";
import {renderBusinessEmail} from "./emails/business-email";
beforeEach(()=>{vi.stubEnv("RESEND_API_KEY","fixture-key");vi.stubEnv("RESEND_FROM_EMAIL","fixture@example.test");transport.send.mockReset().mockResolvedValue({ok:true});});
afterEach(()=>vi.unstubAllEnvs());
it("renders a safe quote and preserves reply-to, attachment, totals and acceptance URL",async()=>{
 const result=await sendQuoteEmail({to:"customer@example.test",businessName:'Builders <script>alert(1)</script>',clientName:'Sam & Jo',total:'NZ$1,150.00',acceptUrl:'https://example.test/accept?token=fixture&source=quote',quoteNumber:'Q-0042',pdf:new Uint8Array([1,2,3]),pdfFileName:'quote.pdf',replyTo:'tradie@example.test'});
 expect(result.ok).toBe(true);const payload=JSON.parse(transport.send.mock.calls[0][1].body);
 expect(payload.reply_to).toBe('tradie@example.test');expect(payload.attachments[0].content).toBe('AQID');expect(payload.html).toContain('NZ$1,150.00');expect(payload.html).not.toContain('<script>');expect(payload.html).toContain('Sam &amp; Jo');expect(payload.text).toContain('https://example.test/accept?token=fixture&source=quote');expect(payload.text).toContain('Q-0042');
});
it("renders invoice due date and multiline payment instructions in HTML and text",async()=>{
 await sendInvoiceEmail({to:'fixture@example.test',businessName:'Builder',clientName:'Sam',total:'A$500.00',dueDateLabel:'30 September 2026',invoiceNumber:'INV-2',paymentInstructions:'Account 00-0000\nReference INV-2',pdf:new Uint8Array([1]),pdfFileName:'invoice.pdf'});
 const body=JSON.parse(transport.send.mock.calls[0][1].body);expect(body.html).toContain('30 September 2026');expect(body.text).toContain('Reference INV-2');expect(body.text).toContain('A$500.00');
});
it("gives request emails a plain-text alternative and retains customer reply-to",async()=>{
 await sendQuoteRequestEmail({to:'tradie@example.test',businessName:'Builder',clientName:'Sam',clientPhone:'000',clientEmail:'sam@example.test',siteAddress:'Fixture site',description:'Deck\nSteps',quoteUrl:'https://example.test/app/quotes/fixture'});
 const body=JSON.parse(transport.send.mock.calls[0][1].body);expect(body.reply_to).toBe('sam@example.test');expect(body.text).toContain('Deck');expect(body.text).toContain('Steps');expect(body.html).toContain('Open the draft quote');
});
it("rejects executable action URLs before rendering",async()=>{await expect(renderBusinessEmail({kind:'quote',businessName:'Builder',clientName:'Sam',actionUrl:'javascript:alert(1)'})).rejects.toThrow('HTTP');});

it("renders reviewable previews for all three email templates",async()=>{
 const output=process.env.T2Q_EMAIL_PREVIEW_DIR;
 for(const kind of ["quote","invoice","request"] as const){
  const result=await renderBusinessEmail({kind,businessName:"Example Building Co.",clientName:"Alex Customer",number:kind==="quote"?"Q-0042":"INV-0018",total:"NZ$1,150.00",dueDate:kind==="invoice"?"30 September 2026":undefined,paymentInstructions:kind==="invoice"?"Bank account: EXAMPLE ONLY\nReference INV-0018":undefined,contact:"alex@example.test",site:"Fictional job site",description:"Replace the entry deck and stairs.\nReview materials and labour before sending.",actionUrl:kind==="invoice"?undefined:"https://example.test/quote/fixture"});
  expect(result.html).toContain("Example Building Co.");expect(result.text).toContain("Alex Customer");
  if(output){const {writeFile}=await import("node:fs/promises");await writeFile(`${output}/email-${kind}-preview.html`,result.html);}
 }
});
