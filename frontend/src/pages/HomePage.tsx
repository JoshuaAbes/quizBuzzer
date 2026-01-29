import { Link } from 'react-router-dom'

export default function HomePage() {
  return (
    <div style={{ padding: '20px' }}>
      <h1>QuizBuzzer 🎯</h1>
      
      <div style={{ marginTop: '30px' }}>
        <h2>Je suis...</h2>
        
        <div style={{ marginTop: '20px' }}>
          <Link to="/mc">
            <button style={{ fontSize: '18px', padding: '10px 20px', marginRight: '10px' }}>
              🎙️ Animateur (MC)
            </button>
          </Link>
          
          <Link to="/player">
            <button style={{ fontSize: '18px', padding: '10px 20px', marginRight: '10px' }}>
              🎮 Joueur
            </button>
          </Link>
          
          <Link to="/screen/demo">
            <button style={{ fontSize: '18px', padding: '10px 20px' }}>
              📺 Écran public
            </button>
          </Link>
        </div>
      </div>
    </div>
  )
}
