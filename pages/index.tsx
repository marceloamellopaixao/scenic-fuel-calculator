"use client";

// Calculadora de Combustível Avançada — Componente de página Next.js (app/page.tsx)
// Tech: Next.js (React), TypeScript, Tailwind CSS, Recharts, Lucide-React
//
// Melhorias da Versão 2.0 (por Gemini):
// - UI/UX Totalmente Redesenhada: Interface mais limpa, moderna e profissional.
// - Suporte a Múltiplos Combustíveis:
//   - O usuário pode alternar entre Etanol, Gasolina, Diesel e GNV.
//   - Cada combustível salva suas próprias configurações (preço/litro, consumo km/L).
//   - O histórico e o gráfico são filtrados pelo combustível selecionado.
// - Ícones em Toda a UI: Uso de `lucide-react` para melhorar a clareza visual.
// - Lógica de Cálculo Aprimorada:
//   - Cálculo bidirecional (R$ ↔ Litros) mais robusto.
//   - O histórico agora salva o `pricePerLiter` *real* do abastecimento (R$ / L),
//     em vez de usar o valor da configuração, tornando o histórico mais preciso.
// - Componentes de UI Reutilizáveis (Internos):
//   - `InputGroup`: Componente de input estilizado com ícones.
//   - `StatCard`: Cartão para exibir estatísticas rápidas.
// - Persistência Aprimorada: Salva as configurações de *todos* os combustíveis no localStorage.

import React, { useEffect, useMemo, useState }from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import {
  Fuel,
  Gauge,
  DollarSign,
  Droplets,
  Route,
  Calendar,
  History,
  LineChart as LineChartIcon,
  Download,
  Upload,
  Trash2,
  Settings,
  Calculator,
  Zap,
  ChevronDown
} from 'lucide-react';

// --- Tipos e Configurações Principais ---

// Define os tipos de combustível suportados
type FuelType = 'Etanol' | 'Gasolina' | 'Diesel' | 'GNV';
const FUEL_TYPES: FuelType[] = ['Etanol', 'Gasolina', 'Diesel', 'GNV'];

// Tipo para as configurações de cada combustível
type FuelSettings = {
  price: number; // R$ / L (ou R$ / m³ para GNV)
  consumption: number; // km / L (ou km / m³ para GNV)
};

// Tipo para cada entrada no histórico de abastecimento
type Refuel = {
  id: string;
  date: string; // ISO
  amountBRL: number; // R$
  liters: number; // L (ou m³ para GNV)
  km: number; // km rodados nesse tanque
  pricePerLiter: number; // R$/L - *Calculado no momento do registro*
  fuelType: FuelType; // Tipo de combustível
};

// Chaves do LocalStorage
const HISTORY_STORAGE_KEY = 'fuel_history_v2';
const SETTINGS_STORAGE_KEY = 'fuel_settings_v2';

// Configurações iniciais padrão
const DEFAULT_SETTINGS: Record<FuelType, FuelSettings> = {
  'Etanol': { price: 4.09, consumption: 6.71 },
  'Gasolina': { price: 5.89, consumption: 9.5 },
  'Diesel': { price: 6.19, consumption: 12.0 },
  'GNV': { price: 4.99, consumption: 14.0 }, // consumo em km/m³
};

// --- Funções Utilitárias ---

/** Gera um ID único simples */
function uid() {
  return Math.random().toString(36).slice(2, 9);
}

/** Converte string (com vírgula ou ponto) para número */
function numeric(s: string | number): number {
  if (typeof s === 'number') return s;
  const n = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Formata um número para string BRL (ex: "1.234,50") */
function fmtBRL(num: number): string {
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Formata um número para string com vírgula (ex: "6,71") */
function fmtNum(num: number, digits = 2): string {
  return num.toFixed(digits).replace('.', ',');
}

// --- Hook de LocalStorage (Genérico) ---

function useLocalStorage<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initial;
    }
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) as T : initial;
    } catch (e) {
      console.warn(`Erro ao ler do localStorage [${key}]:`, e);
      return initial;
    }
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(key, JSON.stringify(state));
      } catch (e) {
        console.error(`Erro ao salvar no localStorage [${key}]:`, e);
      }
    }
  }, [key, state]);

  return [state, setState] as const;
}

// --- Componente Principal ---

export default function FuelCalculatorPage() {
  // --- Estados Principais ---

  // Estado para o tipo de combustível atualmente selecionado
  const [currentFuel, setCurrentFuel] = useState<FuelType>('Etanol');

  // Estado que armazena as configurações (preço/consumo) de *todos* os combustíveis
  const [settings, setSettings] = useLocalStorage<Record<FuelType, FuelSettings>>(
    SETTINGS_STORAGE_KEY,
    DEFAULT_SETTINGS
  );

  // Histórico de abastecimentos
  const [history, setHistory] = useLocalStorage<Refuel[]>(HISTORY_STORAGE_KEY, []);

  // --- Estados dos Inputs do Formulário ---

  // Inputs para R$, Litros e KM Rodados (para novo registro)
  const [amountBRL, setAmountBRL] = useState<string>('');
  const [litersInput, setLitersInput] = useState<string>('');
  const [kmRodadosInput, setKmRodadosInput] = useState<string>(''); // KM rodados

  // Inputs para simulação
  const [simulacaoDistanciaInput, setSimulacaoDistanciaInput] = useState<string>('');
  const [simulacaoCommuteInput, setSimulacaoCommuteInput] = useState<string>('24');

  // Controla qual input (R$ ou L) foi alterado por último pelo usuário
  const [lastChanged, setLastChanged] = useState<'brl' | 'liters'>('brl');

  // --- Dados Derivados (useMemo) ---

  // Configurações (preço e consumo) do combustível *atualmente selecionado*
  const currentSettings = useMemo(() => {
    return settings[currentFuel] || DEFAULT_SETTINGS[currentFuel];
  }, [settings, currentFuel]);

  const currentPrice = currentSettings.price;
  const currentConsumption = currentSettings.consumption;

  // --- Cálculos Derivados (para UI) ---

  const amountNum = useMemo(() => numeric(amountBRL), [amountBRL]);
  const litersNum = useMemo(() => numeric(litersInput), [litersInput]);

  // Autonomia estimada para o card de "Registrar"
  const autonomyFromForm = useMemo(() => {
    const l = lastChanged === 'liters' ? litersNum : (amountNum / currentPrice);
    if (l <= 0 || currentConsumption <= 0 || !Number.isFinite(l)) return 0;
    return l * currentConsumption;
  }, [amountNum, litersNum, lastChanged, currentPrice, currentConsumption]);

  // Cálculos para o card de "Simulações"
  const simDistNum = useMemo(() => numeric(simulacaoDistanciaInput), [simulacaoDistanciaInput]);
  const simCommuteNum = useMemo(() => numeric(simulacaoCommuteInput), [simulacaoCommuteInput]);

  const simDistLitros = useMemo(() => (currentConsumption > 0 ? simDistNum / currentConsumption : 0), [simDistNum, currentConsumption]);
  const simDistValor = useMemo(() => simDistLitros * currentPrice, [simDistLitros, currentPrice]);

  const simCommuteLitros = useMemo(() => (currentConsumption > 0 ? simCommuteNum / currentConsumption : 0), [simCommuteNum, currentConsumption]);
  const simCommuteValor = useMemo(() => simCommuteLitros * currentPrice, [simCommuteLitros, currentPrice]);

  // Dias de autonomia com base no abastecimento simulado e no trajeto diário
  const diasDeAutonomia = useMemo(() => (
    simCommuteNum > 0 && autonomyFromForm > 0 ? autonomyFromForm / simCommuteNum : 0
  ), [autonomyFromForm, simCommuteNum]);


  // --- Histórico e Gráfico ---

  // Histórico filtrado pelo combustível atual
  const filteredHistory = useMemo(() => {
    return history
      .filter(h => h.fuelType === currentFuel)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [history, currentFuel]);

  // Último abastecimento (geral, de qualquer combustível)
  const lastRefuelOverall = useMemo(() => {
    if (!history.length) return null;
    return [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  }, [history]);

  // Último abastecimento do *tipo atual*
  const lastRefuelOfCurrentType = useMemo(() => {
    return filteredHistory[0] || null;
  }, [filteredHistory]);

  // Dados formatados para o gráfico de consumo (km/L)
  const chartData = useMemo(() => {
    return filteredHistory
      .slice()
      .reverse() // Reverte para ordem cronológica
      .map(h => ({
        date: new Date(h.date).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }),
        kmpl: h.km > 0 && h.liters > 0 ? +(h.km / h.liters).toFixed(2) : 0,
        id: h.id
      }))
      .filter(d => d.kmpl > 0); // Mostra apenas entradas com consumo válido
  }, [filteredHistory]);

  // Unidades de medida (L ou m³)
  const unitL = currentFuel === 'GNV' ? 'm³' : 'L';
  const unitKmpl = currentFuel === 'GNV' ? 'km/m³' : 'km/L';

  // --- Efeitos (useEffect) ---

  // Cálculo bidirecional: R$ ↔ Litros
  // Se o usuário digitar em R$
  useEffect(() => {
    if (lastChanged === 'brl') {
      const val = numeric(amountBRL);
      const l = val / currentPrice;
      setLitersInput(val > 0 ? fmtNum(l, 3) : '');
    }
  }, [amountBRL, currentPrice, lastChanged]);

  // Se o usuário digitar em Litros
  useEffect(() => {
    if (lastChanged === 'liters') {
      const l = numeric(litersInput);
      const val = l * currentPrice;
      setAmountBRL(l > 0 ? fmtNum(val, 2) : '');
    }
  }, [litersInput, currentPrice, lastChanged]);

  // --- Handlers (Funções de Ação) ---

  /** Atualiza as configurações (preço/consumo) do combustível atual */
  function handleSettingsChange(field: 'price' | 'consumption', value: string) {
    const numValue = numeric(value);
    if (numValue < 0) return;

    setSettings(prev => ({
      ...prev,
      [currentFuel]: {
        ...prev[currentFuel],
        [field]: numValue,
      },
    }));
  }

  /** Adiciona um novo registro de abastecimento ao histórico */
  function handleAddRefuel() {
    const litersVal = numeric(litersInput);
    const amountVal = numeric(amountBRL);
    const kmVal = numeric(kmRodadosInput);

    if (litersVal <= 0 || amountVal <= 0) {
      alert('Valor em R$ ou Litros deve ser maior que zero.');
      return;
    }

    // Calcula o preço por litro *real* deste abastecimento
    const actualPricePerLiter = amountVal / litersVal;

    const newRefuel: Refuel = {
      id: uid(),
      date: new Date().toISOString(),
      amountBRL: amountVal,
      liters: litersVal,
      km: kmVal,
      pricePerLiter: actualPricePerLiter,
      fuelType: currentFuel
    };

    setHistory(prev => [newRefuel, ...prev]);

    // Limpa os inputs
    setAmountBRL('');
    setLitersInput('');
    setKmRodadosInput('');
    setLastChanged('brl');
  }

  /** Remove uma entrada do histórico */
  function removeEntry(id: string) {
    if (confirm('Tem certeza que deseja remover este registro?')) {
      setHistory(prev => prev.filter(p => p.id !== id));
    }
  }

  /** Exporta o histórico completo como JSON */
  function exportJSON() {
    try {
      const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'fuel_history_v2.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert('Erro ao exportar JSON.');
    }
  }

  /** Importa um arquivo JSON para o histórico */
  function importJSON(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as any[];
        
        // Validação simples dos dados importados
        const validEntries: Refuel[] = parsed
          .filter(p =>
            p && p.id && p.date && p.liters > 0 && p.amountBRL > 0 &&
            (p.fuelType && FUEL_TYPES.includes(p.fuelType))
          )
          .map(p => ({
            id: p.id,
            date: p.date,
            amountBRL: +p.amountBRL,
            liters: +p.liters,
            km: +p.km || 0,
            pricePerLiter: +p.pricePerLiter || (+p.amountBRL / +p.liters),
            fuelType: p.fuelType
          }));
        
        // Evita duplicatas
        const existingIds = new Set(history.map(h => h.id));
        const newEntries = validEntries.filter(p => !existingIds.has(p.id));

        setHistory(prev => [...newEntries, ...prev]);
        alert(`${newEntries.length} novos registros importados com sucesso!`);

      } catch (e) {
        alert('Arquivo JSON inválido ou corrompido.');
      }
    };
    reader.readAsText(file);
  }

  // --- Componentes de UI Internos ---

  /** Um input de formulário estilizado com ícone */
  const InputGroup = React.memo((
    { label, icon, value, onChange, placeholder, type = 'text', unit }:
    { label: string, icon: React.ReactElement, value: string, onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, placeholder?: string, type?: string, unit?: string }
  ) => (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="relative mt-1 rounded-lg shadow-sm">
        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
          {React.cloneElement(icon as React.ReactElement<any>, { className: "h-5 w-5 text-gray-400" })}
        </div>
        <input
          type={type}
          inputMode="decimal"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="block w-full py-3 pl-10 pr-4 border-gray-300 rounded-lg focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
        />
        {unit && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
            <span className="text-gray-500 sm:text-sm">{unit}</span>
          </div>
        )}
      </div>
    </div>
  ));
  InputGroup.displayName = 'InputGroup';

  /** Um cartão de estatística para o resumo */
  const StatCard = React.memo((
    { title, value, icon, unit }:
    { title: string, value: string, icon: React.ReactElement, unit?: string }
  ) => (
    <div className="flex items-center p-4 space-x-4 rounded-lg bg-gray-50">
      <div className="flex-shrink-0">
        {React.cloneElement(icon as React.ReactElement<any>, { className: "h-8 w-8 text-indigo-600" })}
      </div>
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="text-xl font-semibold text-gray-900">
          {value} {unit && <span className="text-base font-normal text-gray-500">{unit}</span>}
        </p>
      </div>
    </div>
  ));
  StatCard.displayName = 'StatCard';

  /** Abas para seleção de combustível */
  const FuelTabs = () => (
    <div className="mb-6">
      <div className="block">
        <nav className="flex flex-wrap gap-2" aria-label="Tabs">
          {FUEL_TYPES.map((fuel) => (
            <button
              key={fuel}
              onClick={() => setCurrentFuel(fuel)}
              className={`
                flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors
                ${currentFuel === fuel
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-white text-gray-600 hover:bg-gray-100'
                }
              `}
            >
              <Fuel className="w-4 h-4" />
              <span>{fuel}</span>
            </button>
          ))}
        </nav>
      </div>
    </div>
  );

  // --- Renderização do Componente ---

  return (
    <main className="min-h-screen p-4 bg-gray-100 md:p-8">
      <div className="max-w-6xl mx-auto">
        
        {/* --- Cabeçalho --- */}
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 md:text-4xl">
            Calculadora de Combustível
          </h1>
          <p className="mt-1 text-lg text-gray-600">
            Gerencie seus abastecimentos e calcule seu consumo.
          </p>
        </header>

        {/* --- Seletor de Combustível --- */}
        <FuelTabs />

        {/* --- Grid Principal de Ações --- */}
        <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-3">
          
          {/* Coluna 1: Registrar Abastecimento */}
          <div className="p-6 bg-white border border-gray-200 shadow-lg lg:col-span-1 rounded-xl">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
              <Droplets className="text-indigo-600" />
              Registrar Abastecimento
            </h2>
            <p className="mb-4 text-sm text-gray-500">
              Preencha <strong>R$</strong> ou <strong>{unitL}</strong> para calcular.
            </p>
            <div className="space-y-4">
              <InputGroup
                label={`Valor Total (R$)`}
                icon={<DollarSign />}
                value={amountBRL}
                onChange={(e) => { setAmountBRL(e.target.value); setLastChanged('brl'); }}
                placeholder="ex: 100,00"
                type="number"
              />
              <InputGroup
                label={`Litros (${unitL})`}
                icon={<Fuel />}
                value={litersInput}
                onChange={(e) => { setLitersInput(e.target.value); setLastChanged('liters'); }}
                placeholder="ex: 20,00"
                type="number"
              />
              
              {/* CÁLCULOS IMEDIATOS (Aprimorado) */}
              <div className="pt-2 pb-4 space-y-2">
                
                {/* Bloco de Valor/Litros Calculado */}
                {lastChanged === 'brl' && amountNum > 0 && (
                  <p className="flex items-center justify-between text-sm text-gray-700">
                    <span>{unitL} Estimados:</span>
                    <strong className="text-lg font-semibold text-gray-900">
                      {fmtNum(litersNum, 2)} {unitL}
                    </strong>
                  </p>
                )}
                {lastChanged === 'liters' && litersNum > 0 && (
                  <p className="flex items-center justify-between text-sm text-gray-700">
                    <span>Valor Estimado:</span>
                    <strong className="text-lg font-semibold text-gray-900">
                      R$ {fmtBRL(amountNum)}
                    </strong>
                  </p>
                )}

                {/* Bloco de Autonomia */}
                {autonomyFromForm > 0 && (
                  <p className="flex items-center justify-between text-sm text-gray-700">
                    <span>Autonomia Estimada:</span>
                    <strong className="text-lg font-semibold text-indigo-600">
                      {fmtNum(autonomyFromForm, 1)} km
                    </strong>
                  </p>
                )}

                {/* Bloco de Dias de Trajeto (NOVO) */}
                {diasDeAutonomia > 0 && (
                  <p className="flex items-center justify-between text-sm text-gray-700">
                    <span>Autonomia (Trajeto Diário):</span>
                    <strong className="text-lg font-semibold text-indigo-600">
                      {fmtNum(diasDeAutonomia, 1)} dias
                    </strong>
                  </p>
                )}
              </div>

              <InputGroup
                label="KM Rodados (Opcional)"
                icon={<Route />}
                value={kmRodadosInput}
                onChange={(e) => setKmRodadosInput(e.target.value)}
                placeholder="ex: 350,0"
                type="number"
              />
              <button
                onClick={handleAddRefuel}
                disabled={numeric(litersInput) <= 0 || numeric(amountBRL) <= 0}
                className="flex items-center justify-center w-full gap-2 px-4 py-3 text-base font-semibold text-white bg-indigo-600 rounded-lg shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
              >
                <History className="w-5 h-5" />
                Adicionar ao Histórico
              </button>
            </div>
          </div>

          {/* Coluna 2: Configurações e Simulações */}
          <div className="space-y-6 lg:col-span-1">
            {/* Card de Configurações */}
            <div className="p-6 bg-white border border-gray-200 shadow-lg rounded-xl">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
                <Settings className="text-indigo-600" />
                Configurações ({currentFuel})
              </h2>
              <p className="mb-4 text-sm text-gray-500">
                Valores usados para cálculos e simulações.
              </p>
              <div className="space-y-4">
                <InputGroup
                  label={`Preço por ${unitL} (R$)`}
                  icon={<DollarSign />}
                  value={String(currentPrice).replace('.', ',')}
                  onChange={(e) => handleSettingsChange('price', e.target.value)}
                  type="number"
                />
                <InputGroup
                  label={`Consumo Médio (${unitKmpl})`}
                  icon={<Gauge />}
                  value={String(currentConsumption).replace('.', ',')}
                  onChange={(e) => handleSettingsChange('consumption', e.target.value)}
                  type="number"
                />
              </div>
            </div>
            
            {/* Card de Simulação Rápida */}
            <div className="p-6 bg-white border border-gray-200 shadow-lg rounded-xl">
              <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
                <Calculator className="text-indigo-600" />
                Simulações de Custo
              </h2>
              <div className="mt-4 space-y-4">
                {/* Simulação de Distância Única */}
                <InputGroup
                  label="Distância da Viagem (km)"
                  icon={<Route />}
                  value={simulacaoDistanciaInput}
                  onChange={e => setSimulacaoDistanciaInput(e.target.value)}
                  placeholder="ex: 150"
                  type="number"
                />
                {simDistNum > 0 && currentConsumption > 0 && (
                  <div className="p-3 text-sm text-gray-700 bg-gray-100 rounded-lg">
                    <p><strong>{unitL} necessários:</strong> {fmtNum(simDistLitros, 2)}</p>
                    <p><strong>Custo da viagem:</strong> R$ {fmtBRL(simDistValor)}</p>
                  </div>
                )}

                {/* Simulação de Deslocamento Diário */}
                <InputGroup
                  label="Deslocamento Diário (ida+volta km)"
                  icon={<Calendar />}
                  value={simulacaoCommuteInput}
                  onChange={e => setSimulacaoCommuteInput(e.target.value)}
                  type="number"
                />
                {simCommuteNum > 0 && currentConsumption > 0 && (
                  <div className="p-3 text-sm text-gray-700 bg-gray-100 rounded-lg">
                    <p><strong>{unitL} por dia:</strong> {fmtNum(simCommuteLitros, 2)}</p>
                    <p><strong>Custo por dia:</strong> R$ {fmtBRL(simCommuteValor)}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Coluna 3: Resumo Rápido */}
          <div className="p-6 bg-white border border-gray-200 shadow-lg lg:col-span-1 rounded-xl">
            <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
              <Zap className="text-indigo-600" />
              Resumo ({currentFuel})
            </h2>
            <div className="mt-4 space-y-4">
              <StatCard
                title={`Último Consumo (${unitKmpl})`}
                value={lastRefuelOfCurrentType && lastRefuelOfCurrentType.km > 0 ? fmtNum(lastRefuelOfCurrentType.km / lastRefuelOfCurrentType.liters) : 'N/D'}
                icon={<Gauge />}
              />
              <StatCard
                title="Autonomia (Último Tanque)"
                value={lastRefuelOfCurrentType && lastRefuelOfCurrentType.km > 0 ? fmtNum(lastRefuelOfCurrentType.km) : 'N/D'}
                unit="km"
                icon={<Route />}
              />
              <StatCard
                title="Custo por KM (Atual)"
                value={currentConsumption > 0 ? `R$ ${fmtBRL(currentPrice / currentConsumption)}` : 'N/D'}
                icon={<DollarSign />}
              />
              <StatCard
                title="Último Preço/L"
                value={lastRefuelOfCurrentType ? `R$ ${fmtBRL(lastRefuelOfCurrentType.pricePerLiter)}` : 'N/D'}
                icon={<Fuel />}
              />
            </div>
          </div>

        </div>

        {/* --- Gráfico de Consumo --- */}
        <section className="p-6 mb-6 bg-white border border-gray-200 shadow-lg rounded-xl">
          <h3 className="flex items-center gap-2 mb-4 text-xl font-semibold text-gray-900">
            <LineChartIcon className="text-indigo-600" />
            Histórico de Consumo ({unitKmpl} de {currentFuel})
          </h3>
          {chartData.length === 0 ? (
            <div className="py-10 text-center text-gray-500">
              <LineChartIcon className="w-12 h-12 mx-auto text-gray-400" />
              <p className="mt-2">Sem dados de consumo para exibir.</p>
              <p className="text-sm">Registre abastecimentos com "KM Rodados" para ver o gráfico.</p>
            </div>
          ) : (
            <div className="w-full h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="date" stroke="#6b7280" />
                  <YAxis domain={['dataMin - 1', 'dataMax + 1']} stroke="#6b7280" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '8px' }}
                    labelFormatter={(label) => `Data: ${label}`}
                    formatter={(value: number) => [fmtNum(value) as any, unitKmpl]}
                  />
                  <Line
                    type="monotone"
                    dataKey="kmpl"
                    stroke="#4f46e5"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#4f46e5' }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* --- Tabela de Histórico --- */}
        <section className="p-6 bg-white border border-gray-200 shadow-lg rounded-xl">
          <h3 className="flex items-center gap-2 mb-4 text-xl font-semibold text-gray-900">
            <History className="text-indigo-600" />
            Histórico Completo (Filtrado para {currentFuel})
          </h3>
          
          {/* Botões de Ação do Histórico */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button 
              onClick={exportJSON}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700"
            >
              <Download className="w-4 h-4" /> Exportar JSON
            </button>
            <label className="flex items-center gap-2 px-4 py-2 text-sm text-gray-800 bg-gray-100 rounded-lg shadow-sm cursor-pointer hover:bg-gray-200">
              <Upload className="w-4 h-4" /> Importar JSON
              <input 
                type="file" 
                accept="application/json" 
                onChange={e => importJSON(e.target.files ? e.target.files[0] : null)} 
                className="hidden"
                onClick={(e) => (e.currentTarget.value = '')} // Permite re-upload
              />
            </label>
            <button 
              onClick={() => {
                if (confirm('Isso limpará *todo* o histórico (incluindo outros combustíveis). Deseja continuar?')) {
                  setHistory([]);
                }
              }}
              className="flex items-center gap-2 px-4 py-2 ml-auto text-sm text-white bg-red-600 rounded-lg shadow-sm hover:bg-red-700"
            >
              <Trash2 className="w-4 h-4" /> Limpar Histórico
            </button>
          </div>

          {/* Tabela */}
          <div className="overflow-x-auto max-h-[500px]">
            {filteredHistory.length === 0 ? (
              <div className="py-10 text-center text-gray-500">
                <History className="w-12 h-12 mx-auto text-gray-400" />
                <p className="mt-2">Nenhum abastecimento registrado para {currentFuel}.</p>
              </div>
            ) : (
              <table className="min-w-full text-sm divide-y divide-gray-200">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 font-medium text-left text-gray-600">Data</th>
                    <th className="px-4 py-3 font-medium text-left text-gray-600">R$ Total</th>
                    <th className="px-4 py-3 font-medium text-left text-gray-600">{unitL}</th>
                    <th className="px-4 py-3 font-medium text-left text-gray-600">R$/{unitL}</th>
                    <th className="px-4 py-3 font-medium text-left text-gray-600">KM</th>
                    <th className="px-4 py-3 font-medium text-left text-gray-600">{unitKmpl}</th>
                    <th className="px-4 py-3 font-medium text-left text-gray-600">Ações</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredHistory.map(h => (
                    <tr key={h.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">{new Date(h.date).toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-3 whitespace-nowrap">R$ {fmtBRL(h.amountBRL)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{fmtNum(h.liters, 2)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">R$ {fmtBRL(h.pricePerLiter)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{h.km > 0 ? fmtNum(h.km, 1) : '—'}</td>
                      <td className="px-4 py-3 font-medium text-indigo-600 whitespace-nowrap">
                        {h.km > 0 && h.liters > 0 ? fmtNum(h.km / h.liters, 2) : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <button onClick={() => removeEntry(h.id)} className="text-red-600 hover:text-red-800">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <footer className="mt-8 text-sm text-center text-gray-500">
          <p>Dados salvos localmente no seu navegador. Feito com ❤️ e React.</p>
        </footer>
        
      </div>
    </main>
  );
}