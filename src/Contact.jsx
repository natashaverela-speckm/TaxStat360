import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageNav, PageFooter } from './PageNav'
const N='#0D1B3E',B='#2563EB',SL='#475569'
const API='https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod'
export default function Contact(){
  const nav=useNavigate()
  const [form,setForm]=useState({name:'',email:'',company:'',subject:'',message:''})
  const [loading,setLoading]=useState(false)
  const [sent,setSent]=useState(false)
  const [err,setErr]=useState('')
  const set=k=>e=>setForm(f=>({...f,[k]:e.target.value}))
  const submit=async()=>{
    if(!form.name||!form.email||!form.message){setErr('Please fill in your name, email, and message.');return}
    setLoading(true);setErr('')
    try{
      const r=await fetch(API+'/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)})
      const d=await r.json()
      if(d.success)setSent(true)
      else setErr(d.error||'Something went wrong. Please email support@taxstat360.com directly.')
    }catch(e){setErr('Network error. Please email support@taxstat360.com directly.')}
    setLoading(false)
  }
  const inp={width:'100%',padding:'12px 14px',border:'1px solid #E2E8F0',borderRadius:8,fontSize:15,color:N,background:'#fff',boxSizing:'border-box',fontFamily:'inherit'}
  return(
    <div style={{minHeight:'100vh',background:'#F8FAFC',fontFamily:'-apple-system,sans-serif'}}>
      <PageNav/>
      <div style={{background:'linear-gradient(135deg,#0D1B3E 0%,#1e3a6e 100%)',padding:'72px 24px',textAlign:'center'}}>
        <p style={{color:'#60A5FA',fontWeight:700,fontSize:13,letterSpacing:'0.12em',textTransform:'uppercase',margin:'0 0 12px'}}>Get In Touch</p>
        <h1 style={{fontSize:42,fontWeight:900,color:'#fff',margin:'0 0 16px'}}>Contact Us</h1>
        <p style={{fontSize:18,color:'#94A3B8',maxWidth:520,margin:'0 auto',lineHeight:1.7}}>Have a question? Our team typically responds within one business day.</p>
      </div>
      <div style={{maxWidth:980,margin:'0 auto',padding:'60px 24px'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1.7fr',gap:32,alignItems:'start'}}>
          <div>
            <div style={{background:'#fff',borderRadius:16,padding:'32px',border:'1px solid #E2E8F0',marginBottom:20}}>
              <h2 style={{fontSize:19,fontWeight:800,color:N,margin:'0 0 20px'}}>Contact Information</h2>
              {[{icon:'✉️',label:'Email',val:'support@taxstat360.com',href:'mailto:support@taxstat360.com'},{icon:'⏰',label:'Response Time',val:'Within 1 business day',href:null}].map((c,i)=>(
                <div key={i} style={{display:'flex',gap:14,marginBottom:i===0?20:0,paddingBottom:i===0?20:0,borderBottom:i===0?'1px solid #F1F5F9':'none'}}>
                  <span style={{fontSize:22}}>{c.icon}</span>
                  <div><p style={{color:'#94A3B8',fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em',margin:'0 0 2px'}}>{c.label}</p>
                  {c.href?<a href={c.href} style={{color:B,fontSize:14,fontWeight:600,textDecoration:'none'}}>{c.val}</a>:<p style={{color:SL,fontSize:14,margin:0}}>{c.val}</p>}</div>
                </div>
              ))}
            </div>
            <div style={{background:'#fff',borderRadius:16,padding:'32px',border:'1px solid #E2E8F0'}}>
              <h2 style={{fontSize:18,fontWeight:800,color:N,margin:'0 0 16px'}}>We Can Help With</h2>
              {['Pricing & plan questions','Technical support','Enterprise & partnership inquiries','Billing & account management','General platform questions'].map((t,i)=>(
                <div key={i} style={{display:'flex',gap:10,marginBottom:10}}><span style={{color:B,fontWeight:800}}>✓</span><p style={{color:SL,fontSize:13,margin:0,lineHeight:1.6}}>{t}</p></div>
              ))}
            </div>
          </div>
          <div style={{background:'#fff',borderRadius:16,padding:'36px',border:'1px solid #E2E8F0'}}>
            {sent?(
              <div style={{textAlign:'center',padding:'40px 0'}}>
                <div style={{fontSize:56,marginBottom:16}}>✅</div>
                <h2 style={{color:N,fontSize:24,fontWeight:800,margin:'0 0 12px'}}>Message sent!</h2>
                <p style={{color:SL,fontSize:15,lineHeight:1.7,margin:'0 0 28px'}}>Thank you for reaching out. We will get back to you within one business day.</p>
                <button onClick={()=>nav('/')} style={{background:B,color:'#fff',border:'none',borderRadius:10,padding:'12px 28px',fontWeight:700,fontSize:15,cursor:'pointer'}}>Back to Home</button>
              </div>
            ):(
              <>
                <h2 style={{fontSize:22,fontWeight:800,color:N,margin:'0 0 4px'}}>Send us a message</h2>
                <p style={{color:SL,fontSize:14,margin:'0 0 24px'}}>Fill out the form and we will get back to you shortly.</p>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
                  <div><label style={{fontSize:12,fontWeight:600,color:SL,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:6}}>Full Name *</label><input style={inp} value={form.name} onChange={set('name')} placeholder="Your full name"/></div>
                  <div><label style={{fontSize:12,fontWeight:600,color:SL,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:6}}>Email *</label><input style={inp} type="email" value={form.email} onChange={set('email')} placeholder="you@company.com"/></div>
                </div>
                <div style={{marginBottom:14}}><label style={{fontSize:12,fontWeight:600,color:SL,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:6}}>Company / Business Name</label><input style={inp} value={form.company} onChange={set('company')} placeholder="Your company name"/></div>
                <div style={{marginBottom:14}}><label style={{fontSize:12,fontWeight:600,color:SL,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:6}}>Subject</label>
                  <select style={{...inp,cursor:'pointer'}} value={form.subject} onChange={set('subject')}>
                    <option value="">Select a topic...</option>
                    <option>Question about pricing and plans</option>
                    <option>Technical support</option>
                    <option>Partnership or enterprise inquiry</option>
                    <option>Billing and account management</option>
                    <option>General platform question</option>
                    <option>Other</option>
                  </select>
                </div>
                <div style={{marginBottom:20}}><label style={{fontSize:12,fontWeight:600,color:SL,textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:6}}>Message *</label><textarea style={{...inp,height:130,resize:'vertical'}} value={form.message} onChange={set('message')} placeholder="Tell us how we can help..."/></div>
                {err&&<p style={{color:'#ef4444',fontSize:13,margin:'0 0 14px',background:'#FEF2F2',padding:'10px 14px',borderRadius:8}}>{err}</p>}
                <button onClick={submit} disabled={loading} style={{width:'100%',padding:'13px',background:B,color:'#fff',border:'none',borderRadius:10,fontWeight:700,fontSize:16,cursor:'pointer',opacity:loading?0.7:1}}>{loading?'Sending...':'Send Message'}</button>
                <p style={{color:'#94A3B8',fontSize:12,textAlign:'center',margin:'12px 0 0'}}>Or email us at <a href="mailto:support@taxstat360.com" style={{color:B}}>support@taxstat360.com</a></p>
              </>
            )}
          </div>
        </div>
      </div>
      <PageFooter/>
    </div>
  )
}
