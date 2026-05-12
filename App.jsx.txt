import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient'; // Conexão com seu Supabase

export default function BolaoRezende() {
  const [match, setMatch] = useState(null);
  const = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [leaderboard, setLeaderboard] = useState();
  const = useState("");
  const = useState("");

  // Função que roda assim que a página carrega
  useEffect(() => {
    fetchNextMatch();
    fetchLeaderboard();
  },);

  // Busca o próximo jogo do Brasil no banco de dados
  async function fetchNextMatch() {
    const { data } = await supabase
     .from('matches')
     .select('*')
     .eq('status', 'pending')
     .order('kickoff_time', { ascending: true })
     .limit(1)
     .single();
    
    if (data) {
      setMatch(data);
      startTimer(data.kickoff_time);
    }
  }

  // Busca o ranking atualizado
  async function fetchLeaderboard() {
    const { data } = await supabase.rpc('get_rezende_leaderboard');
    if (data) setLeaderboard(data);
  }

  // Lógica do Cronômetro (Calcula o tempo faltando até 2 horas ANTES do jogo)
  function startTimer(kickoffTimeStr) {
    const kickoffTime = new Date(kickoffTimeStr).getTime();
    const deadlineTime = kickoffTime - (2 * 60 * 60 * 1000); // Subtrai 2 horas

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const distance = deadlineTime - now;

      if (distance <= 0) {
        clearInterval(interval);
        setTimeLeft("TEMPO ESGOTADO - PALPITES ENCERRADOS");
        setIsLocked(true); // Bloqueia os botões e campos
      } else {
        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        setTimeLeft(`${days}d ${hours}h ${minutes}m ${seconds}s`);
      }
    }, 1000);
  }

  // Função para enviar o palpite para o banco de dados
  async function submitPrediction() {
    if (isLocked) return alert("O tempo para palpites deste jogo já acabou!");
    
    // Aqui assumimos que o usuário já fez login no sistema corporativo
    const user = supabase.auth.user(); 
    
    const { error } = await supabase.from('predictions').insert();

    if (error) {
      alert("Erro ou você já palpitou neste jogo!");
    } else {
      alert("Palpite registrado com sucesso! Boa sorte!");
    }
  }

  return (
    <div style={{ backgroundColor: '#F5F5DC', minHeight: '100vh', padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      
      {/* Cabeçalho */}
      <div style={{ textAlign: 'center', color: '#333333', marginBottom: '30px' }}>
        <h1>🏆 Bolão Copa Rezende</h1>
        <p>A sorte está lançada! Faça sua aposta antes do tempo acabar.</p>
      </div>

      {/* PAINEL DE REGRAS (Visível e Claro) */}
      <div style={{ backgroundColor: '#FFFFFF', padding: '20px', borderRadius: '8px', marginBottom: '30px', borderLeft: '5px solid #FEDF00' }}>
        <h3 style={{ marginTop: 0 }}>📜 Regras e Pontuação</h3>
        <p><b>5 Pontos:</b> Acertar o placar exato do jogo.</p>
        <p><b>2 Pontos:</b> Acertar o vencedor ou empate (mas errar o placar).</p>
        <p><b>0 Pontos:</b> Errar o resultado.</p>
        <hr style={{ border: '1px solid #eee' }} />
        <p><b>Desempate:</b> 1º Mais placares exatos | 2º Quem enviou o palpite primeiro.</p>
        <p><i>Atenção: Os 5 primeiros colocados no ranking final receberão prêmios exclusivos da diretoria!</i></p>
      </div>

      {/* ÁREA DE PALPITES E CRONÔMETRO */}
      {match && (
        <div style={{ backgroundColor: '#009B3A', color: 'white', padding: '30px', borderRadius: '8px', textAlign: 'center' }}>
          <h2>Próximo Jogo: Brasil x {match.opponent}</h2>
          
          <div style={{ margin: '20px 0', fontSize: '24px', fontWeight: 'bold', color: '#FEDF00' }}>
            ⏱ Tempo restante para palpitar:<br />
            {timeLeft}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px' }}>
            <div>
              <label>Brasil</label><br />
              <input 
                type="number" 
                value={brazilScore} 
                onChange={(e) => setBrazilScore(e.target.value)}
                disabled={isLocked}
                style={{ fontSize: '24px', width: '60px', textAlign: 'center' }} 
              />
            </div>
            <span style={{ fontSize: '24px' }}> X </span>
            <div>
              <label>{match.opponent}</label><br />
              <input 
                type="number" 
                value={opponentScore} 
                onChange={(e) => setOpponentScore(e.target.value)}
                disabled={isLocked}
                style={{ fontSize: '24px', width: '60px', textAlign: 'center' }} 
              />
            </div>
          </div>

          <button 
            onClick={submitPrediction} 
            disabled={isLocked}
            style={{ 
              marginTop: '20px', padding: '15px 30px', fontSize: '18px', 
              backgroundColor: isLocked? '#ccc' : '#FEDF00', 
              color: '#333', border: 'none', borderRadius: '5px', cursor: isLocked? 'not-allowed' : 'pointer', fontWeight: 'bold'
            }}
          >
            ENVIAR MEU PALPITE
          </button>
        </div>
      )}

      {/* ÁREA DO RANKING */}
      <div style={{ marginTop: '40px', backgroundColor: '#FFFFFF', padding: '20px', borderRadius: '8px' }}>
        <h2 style={{ color: '#333' }}>📊 Ranking Geral</h2>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #009B3A' }}>
               <th style={{ padding: '10px' }}>Posição</th>
               <th style={{ padding: '10px' }}>Colaborador</th>
               <th style={{ padding: '10px' }}>Pontos Totais</th>
               <th style={{ padding: '10px' }}>Placares Exatos</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((user) => (
              <tr 
                key={user.employee_name} 
                // Destaca os TOP 5 com a cor amarela da seleção
                style={{ backgroundColor: user.rank <= 5? '#FFF8DC' : 'transparent', borderBottom: '1px solid #eee' }}
              >
                 <td style={{ padding: '10px' }}>{user.rank}º</td>
                 <td style={{ padding: '10px', fontWeight: user.rank <= 5? 'bold' : 'normal' }}>
                   {user.employee_name} {user.rank <= 5? "⭐" : ""}
                 </td>
                 <td style={{ padding: '10px' }}>{user.total_points}</td>
                 <td style={{ padding: '10px' }}>{user.exact_scores}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}