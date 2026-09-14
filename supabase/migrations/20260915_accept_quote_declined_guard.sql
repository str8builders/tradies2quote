-- Audit 2026-09-15: accept_quote only refused already-accepted quotes. If the
-- tradie declined a quote while the customer's accept was in flight, the
-- accept won (status back to 'accepted'), silently undoing the decline. The
-- API route already maps a 'declined' error; the function now returns it.
-- Also fixes drift: quote_events.type has 'invoice_sent' live but no
-- checked-in migration added it.
ALTER TYPE public.quote_event_type ADD VALUE IF NOT EXISTS 'invoice_sent';

CREATE OR REPLACE FUNCTION public.accept_quote(p_token text, p_name text, p_email text, p_signature_path text, p_ip text, p_user_agent text, p_total numeric, p_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE q_record record;
BEGIN
  SELECT * INTO q_record FROM public.quotes WHERE public_token = p_token LIMIT 1 FOR UPDATE;
  IF q_record IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;
  IF q_record.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;
  IF q_record.expires_at IS NOT NULL AND q_record.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'expired');
  END IF;
  IF q_record.status = 'accepted' THEN
    RETURN jsonb_build_object('error', 'already_accepted');
  END IF;
  IF q_record.status = 'declined' THEN
    RETURN jsonb_build_object('error', 'declined');
  END IF;
  UPDATE public.quotes SET
    status = 'accepted', accepted_at = now(), accepted_name = p_name,
    accepted_email = p_email, signature_path = p_signature_path,
    accepted_ip = p_ip, accepted_user_agent = p_user_agent,
    accepted_total = p_total, accepted_quote_version = p_version
  WHERE id = q_record.id;
  INSERT INTO public.quote_events (quote_id, type, metadata)
    VALUES (q_record.id, 'accepted', jsonb_build_object('name', p_name));
  RETURN jsonb_build_object('ok', true, 'quote_id', q_record.id);
END $function$;
