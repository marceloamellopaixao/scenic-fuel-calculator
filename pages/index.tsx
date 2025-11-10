"use client";
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ComposedChart,
  Bar
} from 'recharts';
import {
  Fuel,
  Gauge,
  DollarSign,
  Calendar,
  Droplet,
  Route,
  History,
  Download,
  Upload,
  Trash2,
  ChevronDown,
  Settings,
  Container,
  X,
  Edit,
  TrendingUp,
  Calculator,
  Wallet,
  Clock,
  Wrench,
  Info
} from 'lucide-react';

// --- Tipos de Dados ---
type FuelType = 'Etanol' | 'Gasolina' | 'Diesel' | 'GNV';

type Refuel = {
  id: string;
  date: string; // ISO
  fuelType: FuelType;
  amountBRL: number; // R$
  liters: number; // L ou m³
  km: number; // km rodados nesse tanque
  pricePerLiter: number; // R$/L ou R$/m³
}

type FuelSettings = {
  price: number;
  consumption: number; // km/L ou km/m³
  tankSize: number; // L ou m³
}

type AllSettings = Record<FuelType, FuelSettings>;

const STORAGE_KEY_HISTORY = 'fuel_history';
const STORAGE_KEY_SETTINGS = 'fuel_settings';

// --- Configurações Padrão ---
const DEFAULT_SETTINGS: AllSettings = {
  'Etanol': { price: 0, consumption: 0, tankSize: 0 },
  'Gasolina': { price: 0, consumption: 0, tankSize: 0 },
  'Diesel': { price: 0, consumption: 0, tankSize: 0 },
  'GNV': { price: 0, consumption: 0, tankSize: 0 },
};

// --- Funções Utilitárias ---

/** Gera um ID único simples */
function uid() {
  return Math.random().toString(36).slice(2, 9);
}

/** Hook para salvar e ler dados do localStorage (CORRIGIDO PARA HIDRATAÇÃO) */
function useLocalStorage<T>(key: string, initial: T) {
  // 1. Inicia o estado SEMPRE com o valor inicial.
  // Isso garante que o servidor e o primeiro render do cliente sejam idênticos.
  const [state, setState] = useState<T>(initial);

  // 2. Após a montagem (só no cliente), lê o valor real do localStorage.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          // Define o estado com o valor salvo, disparando um segundo render.
          setState(JSON.parse(raw) as T);
        }
      } catch (e) {
        console.error(`Erro ao ler do localStorage (${key}):`, e);
      }
    }
    // O array de dependências vazio [] garante que isso só rode UMA VEZ no cliente.
  }, [key]);

  // 3. Salva qualquer mudança de estado de volta no localStorage.
  useEffect(() => {
    // Não salva o valor inicial no primeiro render, espera a primeira mudança real.
    if (JSON.stringify(state) !== JSON.stringify(initial)) {
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(key, JSON.stringify(state));
        } catch (e) {
          console.error(`Erro ao salvar no localStorage (${key}):`, e);
        }
      }
    }
  }, [key, state, initial]);

  return [state, setState] as const;
}

/** Converte string (com vírgula ou ponto) para número */
const numeric = (s: string | number): number => {
  if (typeof s === 'number') return s;
  const n = parseFloat(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

/** Formata número para string com vírgula (ex: 10,50) */
const fmtNum = (num: number, digits = 2): string => {
  // Adiciona uma guarda para valores nulos ou indefinidos
  if (typeof num !== 'number' || !Number.isFinite(num)) {
    num = 0; // Define um padrão seguro para evitar o crash
  }
  return num.toFixed(digits).replace('.', ',');
};

/** Formata número para Reais (ex: R$ 10,50) */
const fmtBRL = (num: number): string => {
  return `R$ ${fmtNum(num, 2)}`;
};


// --- Componentes de UI Internos (Definidos Fora para evitar re-render) ---

/** Um input de formulário estilizado com ícone */
const InputGroup = React.memo((
  {
    label,
    icon,
    value,
    onChange,
    onBlur,
    placeholder,
    unit
  }: {
    label: string,
    icon: React.ReactElement,
    value: string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void,
    onBlur?: () => void,
    placeholder?: string,
    unit?: string
  }
) => (
  <div>
    <label className="block text-sm font-medium text-slate-700">{label}</label>
    <div className="relative mt-1.5 rounded-xl shadow-sm">
      <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
        {React.cloneElement(icon as React.ReactElement<any>, { className: "h-5 w-5 text-slate-400" })}
      </div>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        className="w-full py-3 pr-4 transition-all border-gray-200 pl-11 bg-gray-50 rounded-xl focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 sm:text-sm"
      />
      {unit && (
        <div className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none">
          <span className="text-slate-500 sm:text-sm">{unit}</span>
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
  <div className="relative p-4 overflow-hidden bg-white border border-gray-100 shadow-lg rounded-3xl">
    <div
      className="absolute top-0 right-0 p-3 m-2 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl opacity-60"
    >
      {React.cloneElement(icon as React.ReactElement<any>, { className: "h-6 w-6 text-indigo-600" })}
    </div>
    <div className="relative z-10">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="text-2xl font-bold text-slate-900">
        {value} {unit && <span className="text-base font-normal text-slate-500">{unit}</span>}
      </p>
    </div>
  </div>
));
StatCard.displayName = 'StatCard';

/** Abas de seleção de combustível (Responsivo) */
const ResponsiveFuelSelector = React.memo((
  { current, onChange }:
    { current: FuelType, onChange: (fuel: FuelType) => void }
) => {
  const fuelTypes: FuelType[] = ['Etanol', 'Gasolina', 'Diesel', 'GNV'];
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-6">
      {/* --- Versão Mobile (Dropdown) --- */}
      <div className="relative md:hidden">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-left text-gray-700 bg-white border border-gray-200 shadow-sm rounded-xl hover:bg-gray-50"
        >
          <span>Combustível: <span className="font-semibold text-indigo-600">{current}</span></span>
          <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'transform rotate-180' : ''}`} />
        </button>
        {isOpen && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-100 shadow-lg rounded-xl">
            <div className="p-1">
              {fuelTypes.map((fuel) => (
                <button
                  key={fuel}
                  onClick={() => {
                    onChange(fuel);
                    setIsOpen(false);
                  }}
                  className={`
                    ${current === fuel ? 'bg-indigo-50 text-indigo-600' : 'text-gray-700'}
                    block w-full text-left px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-100
                  `}
                >
                  {fuel}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* --- Versão Desktop (Pílulas) --- */}
      <div className="hidden md:block">
        <nav className="flex flex-wrap p-1.5 bg-gray-100 rounded-2xl" aria-label="Tabs">
          {fuelTypes.map((fuel) => (
            <button
              key={fuel}
              onClick={() => onChange(fuel)}
              className={`
                ${current === fuel
                  ? 'bg-white text-indigo-600 rounded-xl shadow-md'
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
ResponsiveFuelSelector.displayName = 'ResponsiveFuelSelector';

/** Modal de Configurações */
const SettingsModal = React.memo((
  {
    isOpen,
    onClose,
    currentFuel,
    unitL,
    unitKmpl,
    priceInput,
    setPriceInput,
    consumptionInput,
    setConsumptionInput,
    tankSizeInput,
    setTankSizeInput,
    handleSettingsChange
  }: {
    isOpen: boolean;
    onClose: () => void;
    currentFuel: FuelType;
    unitL: string;
    unitKmpl: string;
    priceInput: string;
    setPriceInput: (val: string) => void;
    consumptionInput: string;
    setConsumptionInput: (val: string) => void;
    tankSizeInput: string;
    setTankSizeInput: (val: string) => void;
    handleSettingsChange: (field: 'price' | 'consumption' | 'tankSize', value: string) => void;
  }
) => {
  if (!isOpen) return null;

  return (
    // Backdrop
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300 bg-black bg-opacity-60 backdrop-blur-sm">
      {/* Painel do Modal */}
      <div className="relative w-full max-w-md p-6 transition-all duration-300 bg-white shadow-2xl rounded-3xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-200">
          <h2 className="flex items-center text-xl font-semibold text-gray-900">
            <Wrench className="w-5 h-5 mr-2 text-indigo-600" />
            Configurações ({currentFuel})
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 transition-colors rounded-full hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Conteúdo (Formulário) */}
        <div className="mt-6 space-y-4">
          <InputGroup
            label={`Preço por ${unitL} (R$)`}
            icon={<DollarSign />}
            value={priceInput}
            onChange={(e) => setPriceInput(e.target.value)}
            onBlur={() => handleSettingsChange('price', priceInput)}
          />
          <InputGroup
            label={`Consumo Médio (${unitKmpl})`}
            icon={<Gauge />}
            value={consumptionInput}
            onChange={(e) => setConsumptionInput(e.target.value)}
            onBlur={() => handleSettingsChange('consumption', consumptionInput)}
          />
          <InputGroup
            label={`Capacidade do Tanque (${unitL})`}
            icon={<Container />}
            value={tankSizeInput}
            onChange={(e) => setTankSizeInput(e.target.value)}
            onBlur={() => handleSettingsChange('tankSize', tankSizeInput)}
          />
        </div>

        {/* Footer */}
        <div className="pt-4 mt-8 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full py-3 font-semibold text-white transition-all bg-indigo-600 shadow-lg rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
});
SettingsModal.displayName = 'SettingsModal';

/** Modal de Histórico de Abastecimento */
const HistoryModal = React.memo(
  ({
    isOpen,
    onClose,
    entry,
  }: {
    isOpen: boolean;
    onClose: () => void;
    entry: Refuel | null;
  }) => {
    if (!isOpen || !entry) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-60 backdrop-blur-sm">
        <div className="relative w-full max-w-md p-6 bg-white shadow-2xl rounded-3xl">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-gray-200">
            <h2 className="flex items-center text-xl font-semibold text-gray-900">
              <History className="w-5 h-5 mr-2 text-indigo-600" />
              Detalhes do Abastecimento
            </h2>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 transition-colors rounded-full hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Conteúdo */}
          <div className="mt-6 space-y-3">
            <div className="flex justify-between text-sm text-slate-700">
              <span className="font-medium">Data:</span>
              <span>{new Date(entry.date).toLocaleString('pt-BR')}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-700">
              <span className="font-medium">Combustível:</span>
              <span>{entry.fuelType}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-700">
              <span className="font-medium">Valor Total:</span>
              <span>{fmtBRL(entry.amountBRL)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-700">
              <span className="font-medium">Litros:</span>
              <span>{fmtNum(entry.liters)} L</span>
            </div>
            <div className="flex justify-between text-sm text-slate-700">
              <span className="font-medium">Km Rodados:</span>
              <span>{fmtNum(entry.km)} km</span>
            </div>
            <div className="flex justify-between text-sm text-slate-700">
              <span className="font-medium">Preço por Litro:</span>
              <span>{fmtBRL(entry.pricePerLiter)}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-4 mt-6 border-t border-gray-200">
            <button
              onClick={onClose}
              className="w-full py-3 font-semibold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }
);
HistoryModal.displayName = "HistoryModal";

// --- Componente Principal da Página ---

export default function FuelCalculatorPage() {

  // --- Estados Principais ---
  const [currentFuel, setCurrentFuel] = useState<FuelType>('Etanol');

  // Estados dos inputs do formulário principal
  const [amountBRLInput, setAmountBRLInput] = useState<string>('');
  const [litersInput, setLitersInput] = useState<string>('');
  const [kmRodadosInput, setKmRodadosInput] = useState<string>('');

  // Estados dos inputs de Simulação
  const [simulacaoDistanciaInput, setSimulacaoDistanciaInput] = useState<string>('');
  const [simulacaoCommuteInput, setSimulacaoCommuteInput] = useState<string>('24'); // Default 24km


  // Histórico (vem do localStorage)
  const [history, setHistory] = useLocalStorage<Refuel[]>(STORAGE_KEY_HISTORY, []);

  // Configurações (vem do localStorage)
  const [allSettings, setAllSettings] = useLocalStorage<AllSettings>(STORAGE_KEY_SETTINGS, DEFAULT_SETTINGS);

  // Estado para o modal de Configurações
  const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);

  // Estados do modal de histórico
  const [isHistoryModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<Refuel | null>(null);

  // Estados dos inputs de Configuração (para digitação livre sem perda de foco)
  const [priceInput, setPriceInput] = useState(fmtNum(allSettings[currentFuel].price));
  const [consumptionInput, setConsumptionInput] = useState(fmtNum(allSettings[currentFuel].consumption, 1));
  const [tankSizeInput, setTankSizeInput] = useState(fmtNum(allSettings[currentFuel].tankSize, 1));

  // --- Memos (Cálculos Derivados) ---

  /** Configurações atuais baseadas no combustível selecionado */
  const currentSettings = useMemo(() => {
    // Combina padrões com dados salvos para garantir que todas as chaves existam
    const saved = allSettings[currentFuel] || {};
    return { ...DEFAULT_SETTINGS[currentFuel], ...saved };
  }, [allSettings, currentFuel]);

  const currentPrice = currentSettings.price;
  const currentConsumption = currentSettings.consumption;
  const currentTankSize = currentSettings.tankSize;

  /** Unidades dinâmicas (L ou m³) */
  const { unitL, unitKmpl } = useMemo(() => ({
    unitL: currentFuel === 'GNV' ? 'm³' : 'L',
    unitKmpl: currentFuel === 'GNV' ? 'km/m³' : 'km/L',
  }), [currentFuel]);

  /** Números do formulário principal */
  const amountBRLNum = useMemo(() => numeric(amountBRLInput), [amountBRLInput]);
  const litersNum = useMemo(() => numeric(litersInput), [litersInput]);
  const kmRodadosNum = useMemo(() => numeric(kmRodadosInput), [kmRodadosInput]);

  /** Números das simulações */
  const simDistNum = useMemo(() => numeric(simulacaoDistanciaInput), [simulacaoDistanciaInput]);
  const simCommuteNum = useMemo(() => numeric(simulacaoCommuteInput), [simulacaoCommuteInput]);

  /** Cálculos em tempo real para o formulário de registro */
  const autonomyFromForm = useMemo(() => {
    const liters = litersNum > 0 ? litersNum : (amountBRLNum / currentPrice);
    return liters * currentConsumption;
  }, [litersNum, amountBRLNum, currentPrice, currentConsumption]);

  const daysOfAutonomy = useMemo(() => {
    if (autonomyFromForm === 0 || simCommuteNum === 0) return 0;
    return autonomyFromForm / simCommuteNum;
  }, [autonomyFromForm, simCommuteNum]);

  const isOverTankLimit = useMemo(() => {
    const liters = litersNum > 0 ? litersNum : (amountBRLNum / currentPrice);
    return liters > 0 && liters > currentTankSize;
  }, [litersNum, amountBRLNum, currentPrice, currentTankSize]);

  /** Histórico filtrado pelo combustível atual */
  const filteredHistory = useMemo(() => {
    return history
      .filter(h => h.fuelType === currentFuel)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [history, currentFuel]);

  /** Dados para os gráficos */
  const chartData = useMemo(() => {
    return filteredHistory
      .slice() // Cria cópia
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) // Ordena por data
      .map(h => ({
        date: new Date(h.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
        kmpl: h.liters > 0 ? +(h.km / h.liters).toFixed(2) : 0,
        pricePerLiter: h.pricePerLiter
      }));
  }, [filteredHistory]);

  /** Estatísticas do Resumo Rápido */
  const lastRefuel = useMemo(() => filteredHistory[0] || null, [filteredHistory]);

  const avgConsumption = useMemo(() => {
    const validEntries = filteredHistory.filter(h => h.km > 0 && h.liters > 0);
    if (validEntries.length === 0) return currentConsumption; // Retorna o da config se não houver histórico
    const totalKm = validEntries.reduce((sum, h) => sum + h.km, 0);
    const totalLiters = validEntries.reduce((sum, h) => sum + h.liters, 0);
    return totalKm / totalLiters;
  }, [filteredHistory, currentConsumption]);

  const avgCostPerKm = useMemo(() => {
    if (avgConsumption === 0) return 0;
    return currentPrice / avgConsumption;
  }, [currentPrice, avgConsumption]);


  // --- Handlers (Ações do Usuário) ---

  /** Atualiza as configurações e salva no localStorage */
  const handleSettingsChange = useCallback((field: 'price' | 'consumption' | 'tankSize', value: string) => {
    const numValue = numeric(value);
    if (numValue < 0) return; // Não permite valores negativos

    setAllSettings(prev => ({
      ...prev,
      [currentFuel]: {
        ...prev[currentFuel],
        [field]: numValue
      }
    }));
  }, [currentFuel, setAllSettings]);

  /** Adiciona um novo registro ao histórico */
  const addRefuel = useCallback(() => {
    if (amountBRLNum <= 0 && litersNum <= 0) {
      alert("Preencha o Valor (R$) ou os Litros.");
      return;
    }

    let finalLiters = litersNum;
    let finalAmountBRL = amountBRLNum;

    if (litersNum > 0) {
      finalAmountBRL = litersNum * currentPrice;
    } else {
      finalLiters = amountBRLNum / currentPrice;
    }

    if (finalLiters <= 0) return;

    // Calcula o preço por litro real deste abastecimento
    const pricePerLiterReal = finalAmountBRL / finalLiters;

    const newRefuel: Refuel = {
      id: String(uid()), // 🔹 Garante ID string
      date: new Date().toISOString(),
      fuelType: currentFuel,
      amountBRL: +finalAmountBRL.toFixed(2),
      liters: +finalLiters.toFixed(2),
      km: kmRodadosNum,
      pricePerLiter: +pricePerLiterReal.toFixed(2)
    };

    // Atualiza histórico no estado e no localStorage
    setHistory(prev => {
      const updated = [newRefuel, ...prev];
      localStorage.setItem('refuels', JSON.stringify(updated)); // 🔹 salva localmente
      return updated;
    });

    // Limpa os campos
    setAmountBRLInput('');
    setLitersInput('');
    setKmRodadosInput('');

  }, [amountBRLNum, litersNum, kmRodadosNum, currentFuel, currentPrice, setHistory]);

  /** Remove um item do histórico */
  const removeEntry = useCallback((id: string | number) => {
    setHistory(prev => {
      const updated = prev.filter(p => String(p.id) !== String(id)); // 🔹 comparação segura
      localStorage.setItem('refuels', JSON.stringify(updated)); // 🔹 atualiza localStorage
      return updated;
    });
  }, [setHistory]);

  /** Exporta o histórico como JSON */
  const exportJSON = useCallback(() => {
    if (history.length === 0) {
      alert("Histórico está vazio.");
      return;
    }
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
      alert("Erro ao exportar dados.");
    }
  }, [history]);

  /** Importa o histórico de um JSON */
  const importJSON = useCallback((file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Refuel[];
        // Validação simples
        const validEntries = parsed.filter(p => p && p.id && p.date && p.liters && p.fuelType);
        if (validEntries.length === 0) {
          alert("Arquivo inválido ou não contém registros de combustível válidos.");
          return;
        }

        // Evita duplicatas - Lógica movida para fora do setHistory
        const existingIds = new Set(history.map(p => p.id));
        const newEntries = validEntries.filter(p => !existingIds.has(p.id));

        if (newEntries.length === 0) {
          alert("Importação concluída, mas nenhum registro novo foi encontrado (registros duplicados).");
          return;
        }

        setHistory(prev => {
          return [...prev, ...newEntries];
        });

        // Agora 'newEntries' está acessível
        alert(`Importação concluída! ${newEntries.length} novos registros adicionados.`);

      } catch (e) {
        console.error("Erro ao importar JSON:", e);
        alert('Arquivo JSON inválido.');
      }
    };
    reader.readAsText(file);
  }, [history, setHistory]); // Adiciona 'history' como dependência


  // --- Effects (Efeitos Colaterais) ---

  /** Sincroniza os inputs de Configuração ao trocar de combustível */
  useEffect(() => {
    setPriceInput(fmtNum(currentSettings.price));
    setConsumptionInput(fmtNum(currentSettings.consumption, 1));
    setTankSizeInput(fmtNum(currentSettings.tankSize, 1));
  }, [currentFuel]); // Dependência crucial: APENAS quando troca de combustível

  // Campo atualmente sendo editado (para evitar loop)
  const [activeField, setActiveField] = useState<'amount' | 'liters' | null>(null);

  // Atualiza "Litros" quando o usuário digita em "Valor (R$)"
  useEffect(() => {
    if (activeField === 'amount') {
      const amount = numeric(amountBRLInput);
      if (amount > 0 && currentPrice > 0) {
        const l = amount / currentPrice;
        setLitersInput(fmtNum(l));
      } else {
        setLitersInput('');
      }
    }
  }, [amountBRLInput, currentPrice, activeField]);

  // Atualiza "Valor (R$)" quando o usuário digita em "Litros"
  useEffect(() => {
    if (activeField === 'liters') {
      const liters = numeric(litersInput);
      if (liters > 0 && currentPrice > 0) {
        const v = liters * currentPrice;
        setAmountBRLInput(fmtNum(v));
      } else {
        setAmountBRLInput('');
      }
    }
  }, [litersInput, currentPrice, activeField]);


  // --- Renderização do Componente ---

  return (
    <main className="min-h-screen p-4 font-sans bg-gray-50 md:p-8">

      {/* Container Principal */}
      <div className="max-w-6xl mx-auto">

        {/* --- Cabeçalho --- */}
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-transparent md:text-4xl bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
            Calculadora de Combustível
          </h1>
          <p className="mt-1 text-base text-slate-500">
            Gerencie o consumo e os gastos do seu veículo.
          </p>
        </header>

        {/* --- Abas de Combustível (Agora Responsivo) --- */}
        <ResponsiveFuelSelector current={currentFuel} onChange={setCurrentFuel} />

        {/* --- Grid Principal (Layout) --- */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">

          {/* --- Coluna da Esquerda (Registros) --- */}
          <div className="space-y-6 lg:col-span-2">

            {/* Card: Registrar Abastecimento */}
            <div className="p-6 bg-white border border-gray-100 shadow-2xl rounded-3xl">
              <h2 className="flex items-center mb-5 text-xl font-semibold text-gray-900">
                <Fuel className="w-5 h-5 mr-2 text-indigo-600" />
                Registrar Abastecimento
              </h2>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <InputGroup
                  label={`Valor Total (R$)`}
                  icon={<DollarSign />}
                  value={amountBRLInput}
                  onChange={(e) => {
                    setActiveField('amount');
                    setAmountBRLInput(e.target.value);
                    if (!e.target.value) setLitersInput('');
                  }}
                  onBlur={() => setActiveField(null)} // libera sincronização
                  placeholder="ex: 100,00"
                />

                <InputGroup
                  label={`Litros (${unitL})`}
                  icon={<Droplet />}
                  value={litersInput}
                  onChange={(e) => {
                    setActiveField('liters');
                    setLitersInput(e.target.value);
                    if (!e.target.value) setAmountBRLInput('');
                  }}
                  onBlur={() => setActiveField(null)}
                  placeholder="ex: 25,00"
                />
              </div>

              <div className="mt-4">
                <InputGroup
                  label="Km Rodados (no tanque anterior)"
                  icon={<Route />}
                  value={kmRodadosInput}
                  onChange={(e) => setKmRodadosInput(e.target.value)}
                  placeholder="ex: 350"
                  unit="km"
                />
              </div>

              {/* Informações em tempo real */}
              {(amountBRLNum > 0 || litersNum > 0) && (
                <div className="p-4 mt-4 space-y-1 text-indigo-800 rounded-xl bg-indigo-50">
                  <div className="flex justify-between text-sm">
                    <strong>Autonomia Estimada:</strong>
                    <span className="font-bold">{fmtNum(autonomyFromForm, 1)} km</span>
                  </div>
                  {simCommuteNum > 0 && (
                    <div className="flex justify-between text-sm">
                      <strong>Dias de Autonomia (Trajeto):</strong>
                      <span className="font-bold">{fmtNum(daysOfAutonomy, 1)} dias</span>
                    </div>
                  )}
                </div>
              )}

              {/* Aviso de Limite do Tanque */}
              {isOverTankLimit && (
                <div className="flex items-center p-3 mt-4 text-sm text-red-700 rounded-xl bg-red-50">
                  <Info className="flex-shrink-0 w-5 h-5 mr-2" />
                  Atenção: A quantidade de litros excede a capacidade do tanque ({fmtNum(currentTankSize, 1)} {unitL}).
                </div>
              )}

              <button
                onClick={addRefuel}
                disabled={amountBRLNum <= 0 && litersNum <= 0}
                className="w-full py-3.5 mt-5 font-semibold text-white rounded-xl shadow-lg transition-all
                          bg-gradient-to-r from-indigo-600 to-purple-600 
                          hover:from-indigo-700 hover:to-purple-700
                          focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2
                          disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Salvar Registro
              </button>
            </div>

            {/* Card: Histórico de Abastecimentos */}
            <div className="p-6 bg-white border border-gray-100 shadow-2xl rounded-3xl">
              <h2 className="flex items-center mb-4 text-xl font-semibold text-gray-900">
                <Clock className="w-5 h-5 mr-2 text-indigo-600" />
                Histórico
              </h2>

              {filteredHistory.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum registro encontrado.</p>
              ) : (
                <div className="overflow-hidden border border-gray-100 rounded-2xl">
                  <table className="w-full text-sm text-left text-gray-700">
                    <thead className="text-gray-500 bg-gray-50">
                      <tr>
                        <th className="px-4 py-2">Data</th>
                        <th className="px-4 py-2">Valor</th>
                        <th className="px-4 py-2 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistory.map((entry) => (
                        <tr
                          key={entry.id}
                          className="transition-all border-t cursor-pointer hover:bg-indigo-50"
                          onClick={() => {
                            setSelectedEntry(entry);
                            setHistoryModalOpen(true);
                          }}
                        >
                          <td className="px-4 py-2">
                            {new Date(entry.date).toLocaleDateString("pt-BR")}
                          </td>
                          <td className="px-4 py-2">{fmtBRL(entry.amountBRL)}</td>
                          <td className="px-4 py-2 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeEntry(entry.id);
                              }}
                              className="p-1 text-red-500 transition-colors rounded-full hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* --- Coluna da Direita (Config & Simulações) --- */}
          <div className="space-y-6">

            {/* Card: Configurações (Agora abre o Modal) */}
            <div className="p-6 bg-white border border-gray-100 shadow-2xl rounded-3xl">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center text-xl font-semibold text-gray-900">
                  <Wrench className="w-5 h-5 mr-2 text-indigo-600" />
                  Configurações
                </h2>
                <button
                  onClick={() => setSettingsModalOpen(true)}
                  className="flex items-center px-3 py-2 text-sm font-medium text-indigo-600 transition-colors bg-indigo-50 rounded-xl hover:bg-indigo-100"
                >
                  <Edit className="w-4 h-4 mr-1.5" />
                  Editar ({currentFuel})
                </button>
              </div>

              {/* Resumo das Configurações Atuais */}
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between p-2.5 rounded-lg bg-gray-50">
                  <span className="text-slate-600">Preço:</span>
                  <span className="font-medium text-slate-900">{fmtBRL(currentPrice)} / {unitL}</span>
                </div>
                <div className="flex justify-between p-2.5 rounded-lg bg-gray-50">
                  <span className="text-slate-600">Consumo:</span>
                  <span className="font-medium text-slate-900">{fmtNum(currentConsumption, 1)} {unitKmpl}</span>
                </div>
                <div className="flex justify-between p-2.5 rounded-lg bg-gray-50">
                  <span className="text-slate-600">Tanque:</span>
                  <span className="font-medium text-slate-900">{fmtNum(currentTankSize, 1)} {unitL}</span>
                </div>
              </div>
            </div>

            {/* Card: Simulações de Custo */}
            <div className="p-6 bg-white border border-gray-100 shadow-2xl rounded-3xl">
              <h2 className="flex items-center mb-5 text-xl font-semibold text-gray-900">
                <Calculator className="w-5 h-5 mr-2 text-indigo-600" />
                Simulações de Custo
              </h2>
              <div className="space-y-4">
                {/* Simulação por Distância */}
                <div>
                  <InputGroup
                    label="Distância da Viagem"
                    icon={<Route />}
                    value={simulacaoDistanciaInput}
                    onChange={(e) => setSimulacaoDistanciaInput(e.target.value)}
                    placeholder="ex: 100"
                    unit="km"
                  />
                  {simDistNum > 0 && (
                    <div className="p-3 mt-2 text-sm rounded-lg bg-gray-50">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Litros:</span>
                        <span className="font-medium text-slate-900">{fmtNum(simDistNum / currentConsumption, 2)} {unitL}</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-slate-600">Custo:</span>
                        <span className="font-medium text-slate-900">{fmtBRL((simDistNum / currentConsumption) * currentPrice)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Simulação de Trajeto Diário */}
                <div>
                  <InputGroup
                    label="Deslocamento Diário"
                    icon={<Clock />}
                    value={simulacaoCommuteInput}
                    onChange={(e) => setSimulacaoCommuteInput(e.target.value)}
                    placeholder="ex: 24"
                    unit="km"
                  />
                  {simCommuteNum > 0 && (
                    <div className="p-3 mt-2 text-sm rounded-lg bg-gray-50">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Custo/dia:</span>
                        <span className="font-medium text-slate-900">{fmtBRL((simCommuteNum / currentConsumption) * currentPrice)}</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-slate-600">Custo/mês:</span>
                        <span className="font-medium text-slate-900">{fmtBRL((simCommuteNum / currentConsumption) * currentPrice * 30)}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Card: Resumo Rápido */}
            <div className="p-6 space-y-4 bg-white border border-gray-100 shadow-2xl rounded-3xl">
              <h2 className="flex items-center text-xl font-semibold text-gray-900">
                <TrendingUp className="w-5 h-5 mr-2 text-indigo-600" />
                Resumo ({currentFuel})
              </h2>
              <StatCard
                title="Consumo Médio (Histórico)"
                value={fmtNum(avgConsumption, 1)}
                unit={unitKmpl}
                icon={<Gauge />}
              />
              <StatCard
                title="Custo Médio por Km"
                value={fmtBRL(avgCostPerKm)}
                unit="(config. atual)"
                icon={<Wallet />}
              />
              <StatCard
                title="Último Abastecimento"
                value={lastRefuel ? fmtBRL(lastRefuel.amountBRL) : '—'}
                unit={lastRefuel ? `${fmtNum(lastRefuel.liters, 2)} ${unitL}` : ''}
                icon={<Droplet />}
              />
            </div>
          </div>

        </div> {/* End Grid Principal */}

        {/* --- Seção do Gráfico --- */}
        <section className="p-6 mt-6 bg-white border border-gray-100 shadow-2xl rounded-3xl">
          <h2 className="flex items-center mb-5 text-xl font-semibold text-gray-900">
            <TrendingUp className="w-5 h-5 mr-2 text-indigo-600" />
            Evolução ({currentFuel})
          </h2>
          {chartData.length < 2 ? (
            <div className="flex items-center justify-center h-64 text-sm text-center text-slate-500">
              Adicione pelo menos dois registros de {currentFuel} com Km rodados para ver a evolução do consumo.
            </div>
          ) : (
            <div className="w-full h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                  <XAxis dataKey="date" stroke="#6b7280" />
                  <YAxis yAxisId="left" orientation="left" stroke="#4f46e5" label={{ value: unitKmpl, angle: -90, position: 'insideLeft', fill: '#4f46e5' }} />
                  <YAxis yAxisId="right" orientation="right" stroke="#6d28d9" label={{ value: `R$/${unitL}`, angle: 90, position: 'insideRight', fill: '#6d28d9' }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'rgba(255, 255, 255, 0.9)', border: '1px solid #ddd', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
                    labelFormatter={(label) => `Data: ${label}`}
                    formatter={(value: number, name: string) => {
                      if (name === 'kmpl') {
                        return [fmtNum(value, 2) as any, `Consumo (${unitKmpl})`];
                      }
                      if (name === 'pricePerLiter') {
                        return [fmtBRL(value) as any, `Preço (${unitL})`];
                      }
                      return [value, name];
                    }}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="kmpl"
                    name="Consumo"
                    stroke="#4f46e5"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#4f46e5' }}
                    activeDot={{ r: 6 }}
                  />
                  <Bar
                    yAxisId="right"
                    dataKey="pricePerLiter"
                    name="Preço"
                    fill="#6d28d9"
                    opacity={0.6}
                    barSize={12}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

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

      </div> {/* End max-w-6xl container */}

      {/* --- MODAL DE CONFIGURAÇÕES --- */}
      {/* Renderiza o modal (controlado pelo estado isSettingsModalOpen) */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        currentFuel={currentFuel}
        unitL={unitL}
        unitKmpl={unitKmpl}
        priceInput={priceInput}
        setPriceInput={setPriceInput}
        consumptionInput={consumptionInput}
        setConsumptionInput={setConsumptionInput}
        tankSizeInput={tankSizeInput}
        setTankSizeInput={setTankSizeInput}
        handleSettingsChange={handleSettingsChange}
      />
      <HistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        entry={selectedEntry}
      />
    </main>
  );
}