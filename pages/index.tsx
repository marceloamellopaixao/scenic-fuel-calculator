"use client";

// Calculadora de Combustível Avançada
// Tech: Next.js (React), TypeScript, Tailwind CSS, Recharts, Lucide-React
// Features:
// - Suporte a múltiplos combustíveis (Etanol, Gasolina, Diesel, GNV)
// - Configurações (Preço, Consumo, Capacidade do Tanque) salvas por combustível
// - Cálculo R$ ↔ Litros em tempo real
// - Histórico local (localStorage) filtrado por combustível
// - Gráfico de consumo (km/L)
// - Simulações de custo (Viagem e Diário)
// - UI moderna com ícones, responsiva.

import React, { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { 
  Fuel, 
  DollarSign, 
  Gauge, 
  Calendar, 
  Route, 
  History, 
  BarChart2, 
  Settings, 
  Plus, 
  Trash2, 
  Upload, 
  Download, 
  FileJson, 
  ChevronDown, 
  Droplet,
  AlertTriangle, // Ícone para o aviso do tanque
  Container // Ícone para a capacidade do tanque
} from 'lucide-react';

// --- Tipos de Dados ---

type FuelType = 'Etanol' | 'Gasolina' | 'Diesel' | 'GNV';

type Refuel = {
  id: string;
  date: string; // ISO
  fuelType: FuelType; // Qual combustível foi usado
  amountBRL: number; // R$
  liters: number; // L (ou m³ para GNV)
  km: number; // km rodados nesse tanque (ou viagem)
  pricePerLiter: number; // R$/L (calculado no momento do registro)
}

type FuelSettings = {
  price: number; // R$/L
  consumption: number; // km/L
  tankSize: number; // L ou m³
}

type AllSettings = {
  [key in FuelType]: FuelSettings;
}

// --- Constantes ---

const STORAGE_KEY_HISTORY = 'fuel_calculator_history_v2';
const STORAGE_KEY_SETTINGS = 'fuel_calculator_settings_v2';

const DEFAULT_SETTINGS: AllSettings = {
  'Etanol': { price: 4.08, consumption: 7.5, tankSize: 50 },
  'Gasolina': { price: 5.89, consumption: 10.5, tankSize: 50 },
  'Diesel': { price: 6.10, consumption: 12.0, tankSize: 50 },
  'GNV': { price: 4.99, consumption: 13.0, tankSize: 15 }, // GNV em R$/m³ e km/m³
};

// --- Funções Helper (Utilitários) ---

/** Gera um ID único simples */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/** Hook para gerenciar estado no localStorage */
function useLocalStorage<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    // Roda apenas no cliente
    if (typeof window === 'undefined') {
      return initial;
    }
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) as T : initial;
    } catch (e) {
      console.error(`Erro ao ler do localStorage (key: ${key}):`, e);
      return initial;
    }
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(key, JSON.stringify(state));
      } catch (e) {
        console.error(`Erro ao salvar no localStorage (key: ${key}):`, e);
      }
    }
  }, [key, state]);

  return [state, setState] as const;
}

/** Converte string (com vírgula ou ponto) para número */
function numeric(s: string | number): number {
  if (typeof s === 'number') return s;
  if (typeof s !== 'string') return 0;
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Formata número para string com vírgula (padrão BR) */
function fmtNum(num: number, digits = 2): string {
  if (typeof num !== 'number' || !Number.isFinite(num)) {
    return '0,00';
  }
  return num.toFixed(digits).replace('.', ',');
}

/** Formata número para R$ */
function fmtBRL(num: number): string {
  return `R$ ${fmtNum(num, 2)}`;
}


// --- Componentes de UI Internos ---
// (Movidos para fora para evitar re-criação e perda de foco)

/** Um input de formulário estilizado com ícone */
const InputGroup = React.memo((
  { label, icon, value, onChange, onBlur, placeholder, type = 'text', unit }:
  { 
    label: string, 
    icon: React.ReactElement<any>, // Corrigido para aceitar 'any' props 
    value: string, 
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void, 
    onBlur?: () => void, // onBlur é opcional
    placeholder?: string, 
    type?: string, 
    unit?: string 
  }
) => (
  <div>
    <label className="block text-sm font-medium text-gray-700">{label}</label>
    <div className="relative mt-1 rounded-lg shadow-sm">
      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
        {React.cloneElement(icon, { className: "h-5 w-5 text-gray-400" })}
      </div>
      <input
        type="text" // Sempre 'text' para permitir vírgula
        inputMode="decimal" // Sempre 'decimal' para teclado numérico no celular
        value={value}
        onChange={onChange}
        onBlur={onBlur} // Aplicando onBlur
        placeholder={placeholder}
        className="block w-full py-3 pl-10 pr-12 transition-colors border-gray-200 bg-gray-50 rounded-xl focus:bg-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 sm:text-sm"
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
  { 
    title: string, 
    value: string, 
    icon: React.ReactElement<any>, // Corrigido para aceitar 'any' props
    unit?: string 
  }
) => (
  <div className="flex items-start p-4 space-x-4 bg-white border border-gray-100 shadow-sm rounded-2xl">
    <div className="flex-shrink-0 p-3 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-xl">
      {React.cloneElement(icon, { className: "h-6 w-6 text-indigo-600" })}
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

/** Abas de seleção de combustível */
const FuelTabs = React.memo((
  { current, onChange }:
  { current: FuelType, onChange: (fuel: FuelType) => void }
) => {
  const fuelTypes: FuelType[] = ['Etanol', 'Gasolina', 'Diesel', 'GNV'];
  return (
    <div className="mb-6">
      <div className="block">
        <nav className="flex flex-wrap p-1 bg-gray-100 rounded-xl" aria-label="Tabs">
          {fuelTypes.map((fuel) => (
            <button
              key={fuel}
              onClick={() => onChange(fuel)}
              className={`
                ${current === fuel
                  ? 'bg-white text-indigo-600 rounded-lg shadow-sm'
                  : 'border-transparent text-gray-500 hover:text-gray-700'}
                w-1/2 md:w-auto flex-grow md:flex-grow-0 whitespace-nowrap py-3 px-4 font-medium text-sm text-center transition-all m-0.5
              `}
            >
              {fuel}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
});
FuelTabs.displayName = 'FuelTabs';


// --- Componente Principal da Página ---

export default function FuelCalculatorPage() {

  // --- Estados (State) ---

  // Estado principal: qual combustível está selecionado
  const [currentFuel, setCurrentFuel] = useState<FuelType>('Etanol');

  // Estados dos formulários (strings, para digitação livre)
  const [amountBRL, setAmountBRL] = useState('');
  const [litersInput, setLitersInput] = useState('');
  const [kmRodadosInput, setKmRodadosInput] = useState('');
  const [lastChanged, setLastChanged] = useState<'brl' | 'liters' | null>(null);

  // Estados das simulações
  const [simulacaoDistanciaInput, setSimulacaoDistanciaInput] = useState('');
  const [simulacaoCommuteInput, setSimulacaoCommuteInput] = useState('');

  // Histórico (vem do localStorage)
  const [history, setHistory] = useLocalStorage<Refuel[]>(STORAGE_KEY_HISTORY, []);
  
  // Configurações (vem do localStorage)
  const [allSettings, setAllSettings] = useLocalStorage<AllSettings>(STORAGE_KEY_SETTINGS, DEFAULT_SETTINGS);

  // Estados dos inputs de Configuração (para digitação livre sem perda de foco)
  const [priceInput, setPriceInput] = useState(fmtNum(allSettings[currentFuel].price));
  const [consumptionInput, setConsumptionInput] = useState(fmtNum(allSettings[currentFuel].consumption));
  const [tankSizeInput, setTankSizeInput] = useState(fmtNum(allSettings[currentFuel].tankSize, 1)); // 1 casa decimal para tanque

  // --- Memos (Cálculos Derivados) ---

  // Retorna as configurações atuais, garantindo que valores padrão existam
  const currentSettings = useMemo(() => {
    // Merge: Garante que se o localStorage tiver settings antigas (sem tankSize),
    // o valor padrão (DEFAULT_SETTINGS) seja usado como fallback.
    const defaults = DEFAULT_SETTINGS[currentFuel];
    const saved = allSettings[currentFuel] || {};
    return { ...defaults, ...saved };
  }, [allSettings, currentFuel]);

  // Valores numéricos das configurações atuais
  const currentPrice = useMemo(()=> numeric(currentSettings.price), [currentSettings]);
  const currentConsumption = useMemo(()=> numeric(currentSettings.consumption), [currentSettings]);
  const currentTankSize = useMemo(()=> numeric(currentSettings.tankSize), [currentSettings]);
  
  // Valores numéricos dos inputs do formulário de registro
  const amountNum = useMemo(() => numeric(amountBRL), [amountBRL]);
  const litersNum = useMemo(() => numeric(litersInput), [litersInput]);
  const kmRodadosNum = useMemo(() => numeric(kmRodadosInput), [kmRodadosInput]);

  // Valores numéricos dos inputs de simulação
  const simDistNum = useMemo(() => numeric(simulacaoDistanciaInput), [simulacaoDistanciaInput]);
  const simCommuteNum = useMemo(() => numeric(simulacaoCommuteInput), [simulacaoCommuteInput]);
  
  // Cálculo de autonomia imediata (para o card de registro)
  const autonomyFromForm = useMemo(() => {
    // Baseia-se em qual campo foi alterado por último
    const litersToCalc = lastChanged === 'liters' ? litersNum : (amountNum / currentPrice);
    return litersToCalc * currentConsumption;
  }, [amountNum, litersNum, currentPrice, currentConsumption, lastChanged]);

  // Cálculo de dias de autonomia (para o card de registro)
  const daysAutonomy = useMemo(() => {
    if (autonomyFromForm > 0 && simCommuteNum > 0) {
      return autonomyFromForm / simCommuteNum;
    }
    return 0;
  }, [autonomyFromForm, simCommuteNum]);

  // Filtra o histórico para o combustível atual
  const filteredHistory = useMemo(() => {
    return history
      .filter(r => r.fuelType === currentFuel)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [history, currentFuel]);

  // Prepara dados para o gráfico
  const chartData = useMemo(() => {
    return filteredHistory
      .slice() // Cria cópia
      .reverse() // Reordena por data ascendente
      .map(h => ({
        // Formata data para o gráfico (ex: 05/11)
        date: new Date(h.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        kmpl: (h.km > 0 && h.liters > 0) ? +(h.km / h.liters).toFixed(2) : null, // +(...) converte para número
        price: +h.pricePerLiter.toFixed(2)
      }));
  }, [filteredHistory]);

  // Estatísticas (Resumo Rápido)
  const lastRefuel = useMemo(() => filteredHistory[0] || null, [filteredHistory]);

  const avgKmpl = useMemo(() => {
    const validEntries = filteredHistory.filter(h => h.km > 0 && h.liters > 0);
    if (validEntries.length === 0) return currentConsumption; // Retorna o da config se não houver histórico
    const totalKm = validEntries.reduce((sum, h) => sum + h.km, 0);
    const totalLiters = validEntries.reduce((sum, h) => sum + h.liters, 0);
    return totalKm / totalLiters;
  }, [filteredHistory, currentConsumption]);

  const avgPrice = useMemo(() => {
    if (filteredHistory.length === 0) return currentPrice; // Retorna o da config
    const totalSpent = filteredHistory.reduce((sum, h) => sum + h.amountBRL, 0);
    const totalLiters = filteredHistory.reduce((sum, h) => sum + h.liters, 0);
    if (totalLiters === 0) return currentPrice;
    return totalSpent / totalLiters;
  }, [filteredHistory, currentPrice]);

  // Unidades de medida (L ou m³)
  const unitL = currentFuel === 'GNV' ? 'm³' : 'L';
  const unitKmpl = currentFuel === 'GNV' ? 'km/m³' : 'km/L';

  // Verifica se o valor excede o tanque
  const isOverTankLimit = useMemo(() => {
    if (currentTankSize <= 0) return false;
    return litersNum > currentTankSize;
  }, [litersNum, currentTankSize]);

  // --- Efeitos (useEffect) ---

  // Cálculo bidirecional: R$ ↔ Litros (EM TEMPO REAL)
  useEffect(() => {
    // Se o usuário digitou em R$
    if (lastChanged === 'brl') {
      const val = numeric(amountBRL);
      if (val === 0) {
        setLitersInput(''); // Limpa se R$ for 0
      } else if (currentPrice > 0) {
        const l = val / currentPrice;
        setLitersInput(fmtNum(l, 3)); // 3 casas decimais para litros
      }
    }
  }, [amountBRL, currentPrice, lastChanged]);

  // Se o usuário digitou em Litros
  useEffect(() => {
    if (lastChanged === 'liters') {
      const l = numeric(litersInput);
      if (l === 0) {
        setAmountBRL(''); // Limpa se Litros for 0
      } else {
        const val = l * currentPrice;
        setAmountBRL(fmtNum(val, 2));
      }
    }
  }, [litersInput, currentPrice, lastChanged]);
  

  // Sincroniza os inputs de Configuração QUANDO O COMBUSTÍVEL MUDA
  useEffect(() => {
    const settings = currentSettings;
    setPriceInput(fmtNum(settings.price, 2));
    setConsumptionInput(fmtNum(settings.consumption, 2));
    setTankSizeInput(fmtNum(settings.tankSize, 1));
  }, [currentFuel]); // <-- CORREÇÃO: Dependência DEVE ser apenas [currentFuel]


  // --- Handlers (Ações do Usuário) ---

  /** Salva alteração nas Configurações (Preço, Consumo, Tanque) */
  const handleSettingsChange = (field: 'price' | 'consumption' | 'tankSize', value: string) => {
    const numValue = numeric(value);
    if (numValue <= 0) return; // Não salva valores inválidos

    const newSettings: FuelSettings = {
      ...currentSettings,
      [field]: numValue,
    };

    setAllSettings(prev => ({
      ...prev,
      [currentFuel]: newSettings,
    }));
  };

  /** Adiciona um novo registro ao histórico */
  const handleAddRefuel = () => {
    if (amountNum <= 0 || litersNum <= 0) {
      alert("Por favor, preencha o Valor (R$) ou os Litros."); // TODO: Substituir por um modal
      return;
    }

    // Calcula o preço por litro *real* deste abastecimento
    const pricePerLiterActual = amountNum / litersNum;

    const newRefuel: Refuel = {
      id: uid(),
      date: new Date().toISOString(),
      fuelType: currentFuel,
      amountBRL: amountNum,
      liters: litersNum,
      km: kmRodadosNum, // Pode ser 0 se não for informado
      pricePerLiter: pricePerLiterActual,
    };

    setHistory(prev => [newRefuel, ...prev]);

    // Limpa os campos do formulário
    setAmountBRL('');
    setLitersInput('');
    setKmRodadosInput('');
    setLastChanged(null);
  };

  /** Remove um item do histórico */
  const removeEntry = (id: string) => {
    // TODO: Substituir por um modal de confirmação
    if (confirm("Tem certeza que deseja remover este registro?")) {
      setHistory(prev => prev.filter(p => p.id !== id));
    }
  };

  /** Exporta o histórico (todos os combustíveis) como JSON */
  const exportJSON = () => {
    try {
      const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'fuel_history.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Erro ao exportar JSON:", e);
      alert("Erro ao exportar JSON.");
    }
  };

  /** Importa um arquivo JSON para o histórico */
  const importJSON = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Refuel[];
        // Validação simples
        const validEntries = parsed.filter(p => p && p.id && p.date && p.fuelType && p.liters > 0);
        if (validEntries.length === 0) {
          alert("Nenhum registro válido encontrado no arquivo.");
          return;
        }
        // Evita duplicatas
        setHistory(prev => {
          const prevIds = new Set(prev.map(r => r.id));
          const newEntries = validEntries.filter(r => !prevIds.has(r.id));
          return [...newEntries, ...prev];
        });
      } catch (e) {
        console.error("Erro ao importar JSON:", e);
        alert('Arquivo JSON inválido.');
      }
    };
    reader.readAsText(file);
  };


  // --- Renderização ---

  return (
    <main className="min-h-screen p-4 md:p-8 font-inter bg-gray-50">
      <div className="max-w-6xl mx-auto">
        
        {/* --- Cabeçalho --- */}
        <header className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
              Calculadora de Combustível
            </span>
          </h1>
          <p className="mt-2 text-lg text-gray-600">
            Gerencie seus gastos e consumo (Etanol, Gasolina, Diesel, GNV).
          </p>
        </header>

        {/* --- Abas de Combustível --- */}
        <FuelTabs current={currentFuel} onChange={setCurrentFuel} />

        {/* --- Grid Principal (Layout) --- */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* Coluna da Esquerda (Formulários) */}
          <div className="flex flex-col col-span-1 gap-6">

            {/* Card: Registrar Abastecimento */}
            <div className="p-6 bg-white border border-gray-100 shadow-2xl rounded-3xl">
              <h2 className="flex items-center text-xl font-semibold text-gray-900">
                <Plus className="w-5 h-5 mr-2 text-indigo-600" />
                Registrar Abastecimento
              </h2>
              <div className="mt-4 space-y-4">
                <InputGroup
                  label={`Valor Total (R$)`}
                  icon={<DollarSign />}
                  value={amountBRL}
                  onChange={(e) => { setAmountBRL(e.target.value); setLastChanged('brl'); }}
                  placeholder="ex: 100"
                />
                <InputGroup
                  label={`Litros (${unitL})`}
                  icon={<Fuel />}
                  value={litersInput}
                  onChange={(e) => { setLitersInput(e.target.value); setLastChanged('liters'); }}
                  placeholder="ex: 20"
                />
                
                {/* CÁLCULOS IMEDIATOS (Aprimorado) */}
                <div className="p-3 text-sm text-gray-700 bg-gray-100 rounded-lg">
                  {lastChanged === 'brl' && amountNum > 0 && (
                    <div>Litros Estimados: <strong className="text-gray-900">{fmtNum(litersNum, 3)} {unitL}</strong></div>
                  )}
                  {lastChanged === 'liters' && litersNum > 0 && (
                    <div>Valor Estimado: <strong className="text-gray-900">{fmtBRL(amountNum)}</strong></div>
                  )}
                  {autonomyFromForm > 0 && (
                    <div>Autonomia Estimada: <strong className="text-gray-900">{fmtNum(autonomyFromForm, 1)} km</strong></div>
                  )}
                  {daysAutonomy > 0 && (
                    <div>Dias de Autonomia (Trajeto): <strong className="text-gray-900">{fmtNum(daysAutonomy, 1)} dias</strong></div>
                  )}
                  {(autonomyFromForm === 0 && daysAutonomy === 0) && (
                    <span className="text-gray-500">Preencha R$ ou Litros para simular.</span>
                  )}
                </div>

                {/* AVISO DE LIMITE DO TANQUE */}
                {isOverTankLimit && (
                  <div className="flex items-center p-3 text-sm text-yellow-800 bg-yellow-100 rounded-lg">
                    <AlertTriangle className="w-5 h-5 mr-2" />
                    <span>Aviso: Quantidade acima da capacidade do tanque ({fmtNum(currentTankSize, 1)} {unitL}).</span>
                  </div>
                )}

                <InputGroup
                  label="KM Rodados (Opcional)"
                  icon={<Route />}
                  value={kmRodadosInput}
                  onChange={(e) => setKmRodadosInput(e.target.value)}
                  placeholder="ex: 350"
                />
                <button
                  onClick={handleAddRefuel}
                  disabled={amountNum <= 0 || litersNum <= 0}
                  className="w-full py-3 font-semibold text-white transition-all duration-300 shadow-lg bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl hover:shadow-indigo-300/50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:from-gray-400 disabled:to-gray-500 disabled:shadow-none disabled:cursor-not-allowed"
                >
                  Salvar Abastecimento
                </button>
              </div>
            </div>

            {/* Card: Configurações */}
            <div className="p-6 bg-white border border-gray-100 shadow-2xl rounded-3xl">
              <h2 className="flex items-center text-xl font-semibold text-gray-900">
                <Settings className="w-5 h-5 mr-2 text-indigo-600" />
                Configurações ({currentFuel})
              </h2>
              <p className="mt-1 text-sm text-gray-500">Valores médios para este combustível. Salvo no seu navegador.</p>
              <div className="mt-4 space-y-4">
                <InputGroup
                  label={`Preço por ${unitL} (R$)`}
                  icon={<DollarSign />}
                  value={priceInput} // Usa o estado de string
                  onChange={(e) => {
                    setPriceInput(e.target.value); // Apenas atualiza o string local
                  }}
                  onBlur={() => {
                    handleSettingsChange('price', priceInput); // Salva no onBlur
                  }}
                />
                <InputGroup
                  label={`Consumo Médio (${unitKmpl})`}
                  icon={<Gauge />}
                  value={consumptionInput} // Usa o estado de string
                  onChange={(e) => {
                    setConsumptionInput(e.target.value); // Apenas atualiza o string local
                  }}
                  onBlur={() => {
                    handleSettingsChange('consumption', consumptionInput); // Salva no onBlur
                  }}
                />
                <InputGroup
                  label={`Capacidade do Tanque (${unitL})`}
                  icon={<Container />} // Novo ícone
                  value={tankSizeInput} // Novo estado de string
                  onChange={(e) => {
                    setTankSizeInput(e.target.value); // Apenas atualiza o string local
                  }}
                  onBlur={() => {
                    handleSettingsChange('tankSize', tankSizeInput); // Salva no onBlur
                  }}
                />
              </div>
            </div>

            {/* Card: Simulações de Custo */}
            <div className="p-6 bg-white border border-gray-100 shadow-2xl rounded-3xl">
              <h2 className="flex items-center text-xl font-semibold text-gray-900">
                <Calendar className="w-5 h-5 mr-2 text-indigo-600" />
                Simulações de Custo
              </h2>
              <div className="mt-4 space-y-4">
                {/* Simulação de Viagem Única */}
                <InputGroup
                  label="Distância da Viagem (km)"
                  icon={<Route />}
                  value={simulacaoDistanciaInput}
                  onChange={e => setSimulacaoDistanciaInput(e.target.value)}
                  placeholder="ex: 150"
                />
                {(simDistNum > 0 && currentConsumption > 0) && (
                  <div className="p-3 text-sm text-gray-700 bg-gray-100 rounded-lg">
                    <div>Necessário: <strong className="text-gray-900">{fmtNum(simDistNum / currentConsumption, 2)} {unitL}</strong></div>
                    <div>Custo: <strong className="text-gray-900">{fmtBRL((simDistNum / currentConsumption) * currentPrice)}</strong></div>
                  </div>
                )}
                
                {/* Simulação de Custo Diário/Recorrente */}
                <InputGroup
                  label="Deslocamento Diário (ida+volta km)"
                  icon={<Calendar />}
                  value={simulacaoCommuteInput}
                  onChange={e => setSimulacaoCommuteInput(e.target.value)}
                  placeholder="ex: 24"
                />
                {(simCommuteNum > 0 && currentConsumption > 0) && (
                  <div className="p-3 text-sm text-gray-700 bg-gray-100 rounded-lg">
                    <div>Consumo/dia: <strong className="text-gray-900">{fmtNum(simCommuteNum / currentConsumption, 2)} {unitL}</strong></div>
                    <div>Custo/dia: <strong className="text-gray-900">{fmtBRL((simCommuteNum / currentConsumption) * currentPrice)}</strong></div>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Coluna da Direita (Dados) */}
          <div className="flex flex-col col-span-1 gap-6 lg:col-span-2">

            {/* Card: Resumo Rápido */}
            <div className="p-6 bg-white border border-gray-100 shadow-2xl rounded-3xl">
              <h2 className="flex items-center text-xl font-semibold text-gray-900">
                <BarChart2 className="w-5 h-5 mr-2 text-indigo-600" />
                Resumo Rápido ({currentFuel})
              </h2>
              <div className="grid grid-cols-1 gap-4 mt-4 md:grid-cols-2 lg:grid-cols-3">
                <StatCard 
                  title="Consumo Médio" 
                  value={fmtNum(avgKmpl, 2)} 
                  unit={unitKmpl} 
                  icon={<Gauge />} 
                />
                <StatCard 
                  title="Preço Médio" 
                  value={fmtBRL(avgPrice)} 
                  unit={`/${unitL}`} 
                  icon={<DollarSign />} 
                />
                <StatCard 
                  title="Custo por KM" 
                  value={fmtBRL(avgPrice / avgKmpl)} 
                  unit="/km" 
                  icon={<Route />} 
                />
                {lastRefuel && (
                  <>
                    <StatCard 
                      title="Último Abastecimento" 
                      value={fmtBRL(lastRefuel.amountBRL)} 
                      unit={`${fmtNum(lastRefuel.liters, 2)} ${unitL}`}
                      icon={<Droplet />} 
                    />
                    {lastRefuel.km > 0 && (
                       <StatCard 
                        title="Último Consumo" 
                        value={fmtNum(lastRefuel.km / lastRefuel.liters, 2)} 
                        unit={unitKmpl}
                        icon={<Gauge />} 
                      />
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Card: Gráfico */}
            <div className="p-6 bg-white border border-gray-100 shadow-2xl rounded-3xl">
              <h2 className="flex items-center text-xl font-semibold text-gray-900">
                <History className="w-5 h-5 mr-2 text-indigo-600" />
                Gráfico de Consumo ({unitKmpl})
              </h2>
              {filteredHistory.length < 2 ? (
                <div className="flex items-center justify-center h-64 text-gray-500">
                  Adicione pelo menos 2 registros (com KM) para ver o gráfico.
                </div>
              ) : (
                <div className="w-full h-64 mt-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                      <XAxis dataKey="date" stroke="#6b7280" />
                      <YAxis domain={['dataMin - 1', 'dataMax + 1']} stroke="#6b7280" />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                        labelFormatter={(label) => `Data: ${label}`}
                        formatter={(value: number, name: string) => [
                          fmtNum(value, 2) as any, // <-- CORREÇÃO AQUI
                          name === 'kmpl' ? `Consumo (${unitKmpl})` : `Preço (${unitL})` // O nome
                        ]}
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
            </div>

            {/* Card: Histórico */}
            <div className="p-6 bg-white border border-gray-100 shadow-2xl rounded-3xl">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <h2 className="flex items-center text-xl font-semibold text-gray-900">
                  <History className="w-5 h-5 mr-2 text-indigo-600" />
                  Histórico ({currentFuel})
                </h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={exportJSON}
                    className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 transition-colors bg-white border shadow-sm border-gray-200/80 rounded-xl hover:bg-gray-50 hover:border-gray-300"
                  >
                    <Download className="w-4 h-4 mr-1.5" />
                    Exportar JSON
                  </button>
                  <label className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 transition-colors bg-white border shadow-sm cursor-pointer border-gray-200/80 rounded-xl hover:bg-gray-50 hover:border-gray-300">
                    <Upload className="w-4 h-4 mr-1.5" />
                    Importar JSON
                    <input type="file" accept="application/json" onChange={e => importJSON(e.target.files ? e.target.files[0] : null)} className="hidden" />
                  </label>
                </div>
              </div>

              {/* Tabela de Histórico */}
              <div className="flow-root mt-4">
                <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                  <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                    {filteredHistory.length === 0 ? (
                      <div className="py-12 text-center text-gray-500">
                        Nenhum registro para {currentFuel}.
                      </div>
                    ) : (
                      <table className="min-w-full divide-y divide-gray-300">
                        <thead>
                          <tr className="text-left text-gray-600">
                            <th scope="col" className="py-3.5 pl-4 pr-3 text-xs font-semibold uppercase tracking-wider text-gray-500 sm:pl-0">Data</th>
                            <th scope="col" className="px-3 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Valor (R$)</th>
                            <th scope="col" className="px-3 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Litros ({unitL})</th>
                            <th scope="col" className="px-3 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">KM</th>
                            <th scope="col" className="px-3 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Consumo ({unitKmpl})</th>
                            <th scope="col" className="px-3 py-3.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Preço/L</th>
                            <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-0"><span className="sr-only">Ações</span></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {filteredHistory.map(h => (
                            <tr key={h.id} className="hover:bg-gray-50">
                              <td className="py-5 pl-4 pr-3 text-sm text-gray-700 whitespace-nowrap sm:pl-0">
                                {new Date(h.date).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                              </td>
                              <td className="px-3 py-5 text-sm text-gray-700 whitespace-nowrap">{fmtBRL(h.amountBRL)}</td>
                              <td className="px-3 py-5 text-sm text-gray-700 whitespace-nowrap">{fmtNum(h.liters, 2)}</td>
                              <td className="px-3 py-5 text-sm text-gray-700 whitespace-nowrap">{h.km > 0 ? fmtNum(h.km, 1) : '—'}</td>
                              <td className="px-3 py-5 text-sm font-medium text-gray-900 whitespace-nowrap">
                                {(h.km > 0 && h.liters > 0) ? fmtNum(h.km / h.liters, 2) : '—'}
                              </td>
                              <td className="px-3 py-5 text-sm text-gray-700 whitespace-nowrap">{fmtBRL(h.pricePerLiter)}</td>
                              <td className="relative py-5 pl-3 pr-4 text-sm font-medium text-right whitespace-nowrap sm:pr-0">
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
                </div>
              </div>
            </div>
            
          </div>
        </div>
        
        {/* --- Rodapé --- */}
        <footer className="mt-12 space-y-2 text-sm text-center text-slate-500">
          <p>
            Desenvolvido e mantido por <a href="https://weven.tech" target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-600 hover:text-indigo-500">Weven</a>.
          </p>
          <p className="text-xs text-slate-400">
            Calculadora de combustível, gerenciamento de consumo (Etanol, Gasolina, Diesel, GNV) e custos.
            Otimize seus gastos com nosso app de cálculo de km por litro.
          </p>
        </footer>
      </div>
    </main>
  );
}