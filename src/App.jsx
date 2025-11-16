import React, { useEffect, useState } from 'react'
import { initializeApp } from 'firebase/app'
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth'
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  limit
} from 'firebase/firestore'

// ---------- Replace these with your Firebase project's config ----------
const firebaseConfig = {
  apiKey: "REPLACE_API_KEY",
  authDomain: "REPLACE_AUTH_DOMAIN",
  projectId: "REPLACE_PROJECT_ID",
  storageBucket: "REPLACE_STORAGE_BUCKET",
  messagingSenderId: "REPLACE_MESSAGING_SENDER_ID",
  appId: "REPLACE_APP_ID"
}
// ---------------------------------------------------------------------

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

const COLORS = ['Orange','White','Green']

export default function App(){
  const [email,setEmail] = useState('')
  const [password,setPassword] = useState('')
  const [user,setUser] = useState(null)
  const [tokens,setTokens] = useState(0)
  const [betAmount,setBetAmount] = useState(5)
  const [choice,setChoice] = useState('Orange')
  const [busy,setBusy] = useState(false)
  const [round,setRound] = useState(null)
  const [history,setHistory] = useState([])

  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, async (u)=>{
      if(u){
        setUser(u)
        // fetch or create user doc
        const userRef = doc(db,'users',u.uid)
        const snap = await getDoc(userRef)
        if(!snap.exists()){
          await setDoc(userRef,{email:u.email, tokens:30, createdAt: serverTimestamp()})
          setTokens(30)
        } else {
          const d = snap.data()
          setTokens(d.tokens || 0)
        }
        loadHistory(u.uid)
      } else {
        setUser(null); setTokens(0); setHistory([])
      }
    })
    return ()=>unsub()
  },[])

  async function loadHistory(uid){
    try{
      const q = query(collection(db,'bets'), orderBy('createdAt','desc'), limit(20))
      const snaps = await getDocs(q)
      const arr = []
      snaps.forEach(s=>arr.push({ id:s.id, ...s.data() }))
      setHistory(arr.filter(h=>h.uid === uid))
    }catch(e){console.error(e)}
  }

  async function register(){
    try{ setBusy(true); await createUserWithEmailAndPassword(auth,email,password) }catch(e){ alert(e.message) }finally{ setBusy(false) }
  }
  async function login(){
    try{ setBusy(true); await signInWithEmailAndPassword(auth,email,password) }catch(e){ alert(e.message) }finally{ setBusy(false) }
  }
  async function logout(){ await signOut(auth); setRound(null) }

  // Place bet demo — client-side aggregation (NOT secure for real money)
  async function placeBet(){
    if(!user) return alert('Login karo pehle')
    if(betAmount <= 0) return alert('Bet positive hona chahiye')
    if(betAmount > tokens) return alert('Tokens kam hain')

    setBusy(true)
    try{
      // deduct immediately
      const userRef = doc(db,'users',user.uid)
      await updateDoc(userRef,{ tokens: tokens - betAmount })
      setTokens(t => t - betAmount)

      // aggregate totals from all bets
      const allSnap = await getDocs(collection(db,'bets'))
      const totals = { Orange:0, White:0, Green:0 }
      allSnap.forEach(s=>{
        const d = s.data()
        if(d && d.choice && typeof d.amount === 'number') totals[d.choice] = (totals[d.choice]||0) + d.amount
      })
      // include current user bet
      totals[choice] = (totals[choice] || 0) + betAmount

      const minTotal = Math.min(...COLORS.map(c=>totals[c]))
      const minColors = COLORS.filter(c=>totals[c] === minTotal)
      const picked = minColors[Math.floor(Math.random() * minColors.length)]

      const won = picked === choice
      const payout = won ? Math.round(betAmount * 2.1 * 100)/100 : 0

      if(won){
        // credit payout
        await updateDoc(userRef, { tokens: (tokens - betAmount) + payout })
        setTokens(t => t + payout)
      }

      await addDoc(collection(db,'bets'), {
        uid: user.uid,
        email: user.email,
        amount: betAmount,
        choice,
        resultPicked: picked,
        won,
        payout,
        createdAt: serverTimestamp()
      })

      loadHistory(user.uid)
      setRound({ picked, won, payout })
    }catch(e){ console.error(e); alert('Error: '+e.message) }
    finally{ setBusy(false) }
  }

  return (
    <div className="container">
      <div className="header">
        <h1>NP Betting — Fun demo</h1>
        <div style={{textAlign:'right'}}>
          <div className="small">{user? user.email : 'Not logged in'}</div>
          <div style={{fontWeight:700}}>{tokens} NP</div>
        </div>
      </div>

      {!user ? (
        <div style={{marginTop:18}}>
          <p className="small">First-time login par 30 NP free.</p>
          <div style={{display:'flex',gap:8,marginTop:8}}>
            <input value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="Email" />
            <input value={password} onChange={(e)=>setPassword(e.target.value)} type="password" placeholder="Password" />
          </div>
          <div style={{display:'flex',gap:8, marginTop:10}}>
            <button className="btn btn-primary" onClick={register} disabled={busy}>Register</button>
            <button className="btn btn-ghost" onClick={login} disabled={busy}>Login</button>
          </div>
        </div>
      ) : (
        <div style={{marginTop:18}}>
          <div style={{marginBottom:8}}>
            <label>Bet amount (NP)</label><br/>
            <input type="number" value={betAmount} onChange={(e)=>setBetAmount(Number(e.target.value))} />
          </div>

          <div>
            <label>Choose color</label>
            <div className="colors">
              <button className="color-btn color-orange" onClick={()=>setChoice('Orange')}>Orange</button>
              <button className="color-btn color-white" onClick={()=>setChoice('White')}>White</button>
              <button className="color-btn color-green" onClick={()=>setChoice('Green')}>Green</button>
            </div>
          </div>

          <div style={{marginTop:12}}>
            <button className="btn btn-primary" onClick={placeBet} disabled={busy}>Place Bet & Spin</button>
            <button className="btn btn-ghost" onClick={logout} style={{marginLeft:8}}>Logout</button>
          </div>

          {round && (
            <div className="card" style={{marginTop:12}}>
              <div>Round picked: <strong>{round.picked}</strong></div>
              <div className={round.won? 'result-win':'result-lose'}>{round.won? `You won! Payout ${round.payout} NP` : 'You lost.'}</div>
            </div>
          )}

          <div className="history">
            <h3>Last bets</h3>
            {history.length===0 && <div className="small">No recent bets.</div>}
            {history.map(h=> (
              <div key={h.id} className="card">
                <div><strong>{h.choice}</strong> — bet {h.amount} NP</div>
                <div className="small">result: {h.resultPicked} — {h.won? `won ${h.payout}`:'lost'}</div>
                <div className="small">{h.createdAt?.toDate ? h.createdAt.toDate().toLocaleString() : ''}</div>
              </div>
            ))}
          </div>

        </div>
      )}

      <div style={{marginTop:18}} className="small">Note: Demo mode. For production, move draw & aggregation server-side.</div>
    </div>
  )
}
