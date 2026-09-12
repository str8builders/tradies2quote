import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {sendTeamCode} from './team-email';
describe('team email verification',()=>{
 beforeEach(()=>{process.env.RESEND_API_KEY='test-fixture';process.env.RESEND_FROM_EMAIL='Test <test@example.invalid>';vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true}));});
 afterEach(()=>vi.unstubAllGlobals());
 it('sends the code only to the server-resolved invited address',async()=>{await sendTeamCode('invited@example.invalid','12345678');const call=vi.mocked(fetch).mock.calls[0];const body=JSON.parse(call[1]!.body as string);expect(body.to).toEqual(['invited@example.invalid']);expect(body.text).toContain('12345678');expect(body.text).toContain('10 minutes');});
 it('does not accept arbitrary message content as a code',async()=>{await expect(sendTeamCode('invited@example.invalid','<script>')).rejects.toThrow();expect(fetch).not.toHaveBeenCalled();});
 it('reports sending failure without pretending a code was delivered',async()=>{vi.mocked(fetch).mockResolvedValue({ok:false,status:429} as Response);await expect(sendTeamCode('invited@example.invalid','12345678')).rejects.toThrow('429');});
});
