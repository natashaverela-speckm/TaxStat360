import {useEffect,useState} from "react"
const API='https://05madmjrqd.execute-api.us-east-1.amazonaws.com/prod'
export default function WaveCallback(){
  const [msg,setMsg]=useState('Connecting Wave...')
  useEffect(()=>{
    const p=new URLSearchParams(window.location.search)
    const code=p.get('code')
    const state=p.get('state')
    if(code){
      setMsg('Importing your Wave data...')
      window.location.replace(`${API}/auth/wave/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state||'')}`)
    } else {
      window.location.replace('/calculate-tax')
    }
  },[])
  return(
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Inter',sans-serif",background:'#F8FAFC'}}>
      <div style={{textAlign:'center',color:'#64748B'}}>
        <div style={{fontSize:32,marginBottom:12}}>🌊</div>
        <div style={{fontWeight:600,fontSize:16}}>{msg}</div>
      </div>
    </div>
  )
}
