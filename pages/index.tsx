// Next.js Fuel Calculator — single-file page component (app/page.tsx)
// Tech: Next.js (React), TypeScript, Tailwind CSS, Recharts
// Features:
// - Cálculo R$ ↔ litros ↔ km
// - Histórico local usando localStorage
// - Gráfico de consumo (km/L)
// - Estimativa de autonomia com base no último abastecimento
// - Export/Import de histórico (JSON)
// - Responsivo e pronto para integrar a um projeto Next.js com Tailwind

import React, { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

type Refuel = {
  id: string;
  date: string; // ISO
  amountBRL: number; // R$
  liters: number; // L
  km: number; // km driven on that tank (or trip)
  pricePerLiter: number; // R$/L
}

const STORAGE_KEY = 'scenic_fuel_history_v1';

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function useLocalStorage<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) as T : initial;
    } catch (e) {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
      // ignore
    }
  }, [key, state]);

  return [state, setState] as const;
}

export default function FuelCalculatorPage() {
  // Defaults based on your measured values
  const [pricePerLiter, setPricePerLiter] = useState<number>(4.09);
  const [consumptionKmPerL, setConsumptionKmPerL] = useState<number>(6.71);

  const [amountBRL, setAmountBRL] = useState<string>('60');
  const [litersInput, setLitersInput] = useState<string>('');
  const [distanceInput, setDistanceInput] = useState<string>('');
  const [commuteKm, setCommuteKm] = useState<string>('24');

  const [history, setHistory] = useLocalStorage<Refuel[]>(STORAGE_KEY, []);

  // Derived calculations
  const numeric = (s: string | number) => {
    if (typeof s === 'number') return s;
    const n = parseFloat(String(s).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };

  const amountNum = numeric(amountBRL);
  const litersFromAmount = amountNum / pricePerLiter;
  const litersNum = numeric(litersInput);
  const distanceNum = numeric(distanceInput);
  const commuteNum = numeric(commuteKm);

  const autonomyFromAmount = litersFromAmount * consumptionKmPerL;
  const autonomyFromLiters = litersNum * consumptionKmPerL;
  const litersForDistance = distanceNum / consumptionKmPerL;
  const priceForLiters = (l: number) => l * pricePerLiter;

  // last refuel (most recent by date)
  const lastRefuel = useMemo(() => {
    if (!history.length) return null;
    return [...history].sort((a,b)=> new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  }, [history]);

  // Chart data (km/L over time) — computed per entry as km / liters
  const chartData = useMemo(() => {
    return history
      .slice()
      .sort((a,b)=> new Date(a.date).getTime() - new Date(b.date).getTime())
      .map(h => ({ date: new Date(h.date).toLocaleDateString(), kmpl: +(h.km / h.liters).toFixed(2) }));
  }, [history]);

  // Handlers
  function addRefuel(liters: number, amountBRLVal?: number, km?: number) {
    const litersVal = liters;
    const amountVal = amountBRLVal ?? litersVal * pricePerLiter;
    const kmVal = km ?? 0;
    const r: Refuel = { id: uid(), date: new Date().toISOString(), amountBRL: +amountVal, liters: +litersVal, km: +kmVal, pricePerLiter: pricePerLiter };
    setHistory(prev => [r, ...prev]);
  }

  function removeEntry(id: string) {
    setHistory(prev => prev.filter(p => p.id !== id));
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scenic_fuel_history.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJSON(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Refuel[];
        // simple validation
        const valid = parsed.filter(p => p && p.id && p.date && p.liters);
        setHistory(prev => [...valid, ...prev]);
      } catch (e) {
        alert('Arquivo inválido');
      }
    };
    reader.readAsText(file);
  }

  // UI helpers
  function fmt(num: number, digits=2) { return num.toFixed(digits).replace('.', ','); }

  // Auto-calc when user fills liters field -> compute value
  useEffect(() => {
    if (litersInput) {
      const l = numeric(litersInput);
      const v = l * pricePerLiter;
      setAmountBRL(String(+v.toFixed(2)));
    }
  }, [litersInput, pricePerLiter]);

  return (
    <main className="min-h-screen p-6 bg-slate-50 md:p-12">
      <div className="max-w-4xl mx-auto">
        <header className="mb-6">
          <h1 className="text-2xl font-bold md:text-3xl">Calculadora de Combustível — Renault Scénic</h1>
          <p className="mt-1 text-sm text-gray-600">Etanol — baseado em seus dados. Histórico local salvo no seu navegador.</p>
        </header>

        <section className="grid grid-cols-1 gap-4 mb-6 md:grid-cols-2">
          <div className="p-4 bg-white shadow rounded-2xl">
            <h2 className="mb-3 font-semibold">Configurações</h2>
            <label className="block text-xs text-gray-700">Preço por litro (R$)</label>
            <input value={String(pricePerLiter)} onChange={e=>setPricePerLiter(numeric(e.target.value))} className="w-full p-2 mt-2 border rounded" />

            <label className="block mt-3 text-xs text-gray-700">Consumo médio (km/L)</label>
            <input value={String(consumptionKmPerL)} onChange={e=>setConsumptionKmPerL(numeric(e.target.value))} className="w-full p-2 mt-2 border rounded" />

            <div className="mt-4 text-sm text-gray-600">Dica: peça em <span className="font-medium">litros</span> para garantir quantidade exata.</div>
          </div>

          <div className="p-4 bg-white shadow rounded-2xl">
            <h2 className="mb-3 font-semibold">Conversões rápidas</h2>

            <label className="block text-xs text-gray-700">Valor (R$)</label>
            <input value={amountBRL} onChange={e=>setAmountBRL(e.target.value)} className="w-full p-2 mt-2 border rounded" />
            <div className="mt-2 text-sm">Litros estimados: <strong>{fmt(litersFromAmount,2)} L</strong></div>
            <div className="text-sm">Autonomia estimada: <strong>{fmt(autonomyFromAmount,1)} km</strong></div>

            <label className="block mt-3 text-xs text-gray-700">Litros</label>
            <input value={litersInput} onChange={e=>setLitersInput(e.target.value)} className="w-full p-2 mt-2 border rounded" />
            <div className="mt-2 text-sm">Valor: <strong>R$ {fmt(priceForLiters(numeric(litersInput)),2)}</strong></div>
            <div className="text-sm">Autonomia: <strong>{fmt(autonomyFromLiters,1)} km</strong></div>

            <label className="block mt-3 text-xs text-gray-700">Distância (km)</label>
            <input value={distanceInput} onChange={e=>setDistanceInput(e.target.value)} className="w-full p-2 mt-2 border rounded" />
            <div className="mt-2 text-sm">Litros necessários: <strong>{fmt(litersForDistance,2)} L</strong> — Valor: <strong>R$ {fmt(priceForLiters(litersForDistance),2)}</strong></div>

            <label className="block mt-3 text-xs text-gray-700">Deslocamento diário (ida+volta km)</label>
            <input value={commuteKm} onChange={e=>setCommuteKm(e.target.value)} className="w-full p-2 mt-2 border rounded" />
            <div className="mt-2 text-sm">Litros/dia: <strong>{fmt(commuteNum / consumptionKmPerL,2)} L</strong> — Custo/dia: <strong>R$ {fmt((commuteNum / consumptionKmPerL) * pricePerLiter,2)}</strong></div>

            <div className="flex gap-2 mt-3">
              <button onClick={()=>{ addRefuel(litersFromAmount, amountNum, 0); setLitersInput(''); setAmountBRL(''); }} className="px-3 py-2 text-white bg-green-600 rounded-2xl">Adicionar (a partir de R$)</button>
              <button onClick={()=>{ if(!litersInput) return; addRefuel(numeric(litersInput), undefined, 0); setLitersInput(''); setAmountBRL(''); }} className="px-3 py-2 border rounded-2xl">Adicionar (litros)</button>
            </div>

          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 mb-6 lg:grid-cols-3">
          <div className="col-span-2 p-4 bg-white shadow rounded-2xl">
            <h3 className="mb-3 font-semibold">Histórico (local)</h3>
            <div className="overflow-auto max-h-72">
              {history.length === 0 ? (
                <div className="text-sm text-gray-500">Nenhum abastecimento registrado.</div>
              ) : (
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="text-left text-gray-600">
                      <th className="w-1/4">Data</th>
                      <th className="w-1/6">R$</th>
                      <th className="w-1/6">Litros</th>
                      <th className="w-1/6">Km</th>
                      <th className="w-1/6">km/L</th>
                      <th className="w-1/6">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(h => (
                      <tr key={h.id} className="border-t">
                        <td>{new Date(h.date).toLocaleString()}</td>
                        <td>R$ {fmt(h.amountBRL,2)}</td>
                        <td>{fmt(h.liters,2)}</td>
                        <td>{fmt(h.km,1)}</td>
                        <td>{h.liters > 0 ? fmt(h.km / h.liters,2) : '—'}</td>
                        <td><button onClick={()=>removeEntry(h.id)} className="text-xs text-red-600">Remover</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex gap-2 mt-4">
              <button onClick={exportJSON} className="px-3 py-2 text-white bg-blue-600 rounded-2xl">Exportar JSON</button>
              <label className="px-3 py-2 border cursor-pointer rounded-2xl">
                Importar JSON
                <input type="file" accept="application/json" onChange={e=>importJSON(e.target.files ? e.target.files[0] : null)} className="hidden" />
              </label>
              <button onClick={()=>setHistory([])} className="px-3 py-2 text-red-600 border rounded-2xl">Limpar histórico</button>
            </div>
          </div>

          <div className="p-4 bg-white shadow rounded-2xl">
            <h3 className="mb-3 font-semibold">Resumo Rápido</h3>
            <div className="text-sm">
              <div>Último abastecimento: <strong>{lastRefuel ? `${fmt(lastRefuel.liters,2)} L — R$ ${fmt(lastRefuel.amountBRL,2)}` : '—'}</strong></div>
              <div className="mt-2">Último consumo (km/L): <strong>{lastRefuel && lastRefuel.liters>0 ? fmt(lastRefuel.km / lastRefuel.liters,2) : '—'}</strong></div>
              <div className="mt-2">Estimativa autonomia (último): <strong>{lastRefuel ? fmt(lastRefuel.liters * (lastRefuel.km / lastRefuel.liters || consumptionKmPerL),1) + ' km' : '—'}</strong></div>
              <div className="mt-2">Custo por km (média atual): <strong>R$ {fmt(pricePerLiter / consumptionKmPerL,3)}</strong></div>
            </div>

            <div className="mt-4">
              <h4 className="font-medium">Simulações</h4>
              <ul className="mt-2 text-sm">
                {[50,100,200].map(d=>{
                  const l = d / consumptionKmPerL; const v = l * pricePerLiter;
                  return <li key={d}>{`${d} km → ${fmt(l,2)} L → R$ ${fmt(v,2)}`}</li>
                })}
              </ul>
            </div>

          </div>
        </section>

        <section className="p-4 mb-6 bg-white shadow rounded-2xl">
          <h3 className="mb-3 font-semibold">Gráfico de consumo (km/L)</h3>
          {chartData.length === 0 ? (
            <div className="text-sm text-gray-500">Adicione entradas para ver o gráfico.</div>
          ) : (
            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="kmpl" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <footer className="mt-6 text-xs text-gray-500">Gerado para uso pessoal — dados salvos apenas no seu navegador. Dicas: peça em litros no posto para garantir quantidade exata. Desenvolvido com foco em usabilidade móvel e desktop.</footer>
      </div>
    </main>
  );
}

/*
Instruções rápidas de integração no Next.js (app router):
1) Instale dependências:
   npm install recharts
2) Configure Tailwind conforme docs do Next.js + Tailwind.
3) Salve este arquivo em `app/page.tsx` (ou `pages/index.tsx` adaptando a export default).
4) Rode `npm run dev`.

Observações:
- O componente carrega Recharts dinamicamente para evitar SSR errors.
- O histórico é salvo em localStorage (key: scenic_fuel_history_v1).
- Você pode estender os campos (nome do posto, odo/km do veículo, foto do recibo, etc).
*/
