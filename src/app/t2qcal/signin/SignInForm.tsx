"use client";
import {useState} from "react";
import {Envelope,Lock,Eye,EyeSlash,ArrowRight} from "@phosphor-icons/react";
import {t2qcalSignInAction} from "./actions";

export function SignInForm({next,error}:{next:string;error?:string}){
  const [show,setShow]=useState(false);
  return <form action={t2qcalSignInAction} className="native-group native-form" data-testid="t2qcal-signin-form">
    <input type="hidden" name="next" value={next}/>
    {error&&<p role="alert" className="native-form-error" data-testid="t2qcal-signin-error">{error}</p>}
    <label className="native-field"><span>Email</span><span className="native-input"><Envelope size={18}/><input name="email" type="email" autoComplete="email" inputMode="email" required data-testid="t2qcal-signin-email"/></span></label>
    <label className="native-field"><span>Password</span><span className="native-input"><Lock size={18}/><input name="password" type={show?"text":"password"} autoComplete="current-password" required data-testid="t2qcal-signin-password"/><button type="button" onClick={()=>setShow(v=>!v)} aria-label={show?"Hide password":"Show password"} className="native-input-toggle">{show?<EyeSlash size={18}/>:<Eye size={18}/>}</button></span></label>
    <button type="submit" className="native-primary" data-testid="t2qcal-signin-submit">Sign in <ArrowRight size={18} weight="bold"/></button>
    <p className="native-footnote native-form-links"><a href="/forgot-password">Forgot password?</a><a href={`/signup?next=${encodeURIComponent(next)}`}>No account? Start free</a></p>
  </form>;
}
