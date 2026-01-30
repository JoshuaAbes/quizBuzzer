import { Link } from 'react-router-dom'

export default function HomePage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px',
      gap: '40px',
    }}>
      <h1 style={{
        fontSize: '60px',
        fontWeight: '700',
        textTransform: 'uppercase',
        textAlign: 'center',
        marginBottom: '20px',
        textShadow: '4px 4px 0px #000',
      }}>
        QUIZBUZZER
      </h1>
      
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        width: '100%',
        maxWidth: '400px',
      }}>
        <Link to="/mc" style={{ textDecoration: 'none' }}>
          <button style={{
            width: '100%',
            padding: '20px 40px',
            fontSize: '32px',
            fontWeight: '600',
            backgroundColor: '#413677',
            color: 'white',
            borderRadius: '15px',
            border: '4px solid #000',
          }}>
            MC
          </button>
        </Link>
        
        <Link to="/player" style={{ textDecoration: 'none' }}>
          <button style={{
            width: '100%',
            padding: '20px 40px',
            fontSize: '32px',
            fontWeight: '600',
            backgroundColor: '#413677',
            color: 'white',
            borderRadius: '15px',
            border: '4px solid #000',
          }}>
            JOUEUR
          </button>
        </Link>
        
        <Link to="/screen/demo" style={{ textDecoration: 'none' }}>
          <button style={{
            width: '100%',
            padding: '20px 40px',
            fontSize: '32px',
            fontWeight: '600',
            backgroundColor: '#413677',
            color: 'white',
            borderRadius: '15px',
            border: '4px solid #000',
          }}>
            ECRAN SCORE
          </button>
        </Link>
      </div>
    </div>
  )
}
