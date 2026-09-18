// Lista universal do checklist (ADR-013): sempre presente e usada também para
// destino fora do catálogo. Conteúdo curado: sem regra de entrada, visto,
// passaporte, vacina, previsão de clima ou vocabulário de reserva/venda.
import type { ItemChecklist } from "../tipos";

export const ITENS_UNIVERSAIS: ItemChecklist[] = [
  // documentos e dinheiro
  { itemKey: "documentos.rg-ou-cnh", categoria: "documentos", texto: "RG ou CNH" },
  { itemKey: "documentos.cpf", categoria: "documentos", texto: "CPF" },
  {
    itemKey: "documentos.cartao-plano-de-saude",
    categoria: "documentos",
    texto: "Cartão do plano de saúde, se houver",
  },
  {
    itemKey: "documentos.dinheiro-e-cartoes",
    categoria: "documentos",
    texto: "Um pouco de dinheiro e seus cartões",
  },
  {
    itemKey: "documentos.contato-da-hospedagem",
    categoria: "documentos",
    texto: "Endereço e contatos da hospedagem anotados, também fora do celular",
  },
  {
    itemKey: "documentos.autorizacao-do-menor",
    categoria: "documentos",
    texto: "Documento ou autorização do menor, se viajar com criança ou adolescente",
  },

  // roupas e calçados
  {
    itemKey: "roupas.pecas-do-dia-a-dia",
    categoria: "roupas",
    texto: "Roupas para todos os dias da viagem, com uma muda extra",
  },
  {
    itemKey: "roupas.roupa-de-dormir",
    categoria: "roupas",
    texto: "Roupa de dormir",
  },
  {
    itemKey: "roupas.roupa-intima-e-meias",
    categoria: "roupas",
    texto: "Roupa íntima e meias",
  },
  {
    itemKey: "roupas.calcado-confortavel",
    categoria: "roupas",
    texto: "Calçado confortável para caminhar",
  },
  {
    itemKey: "roupas.casaco-leve",
    categoria: "roupas",
    texto: "Um casaco leve para a noite ou para o ar-condicionado",
  },

  // higiene e cuidados
  {
    itemKey: "higiene.escova-e-pasta-de-dente",
    categoria: "higiene",
    texto: "Escova e pasta de dente",
  },
  {
    itemKey: "higiene.itens-de-banho",
    categoria: "higiene",
    texto: "Sabonete, xampu e desodorante",
  },
  {
    itemKey: "higiene.protetor-solar",
    categoria: "higiene",
    texto: "Protetor solar",
  },
  {
    itemKey: "higiene.itens-pessoais",
    categoria: "higiene",
    texto: "Seus itens pessoais de uso diário",
  },
  {
    itemKey: "higiene.toalha-pessoal",
    categoria: "higiene",
    texto: "Toalha, se a hospedagem não fornecer",
  },

  // eletronicos e carregadores
  {
    itemKey: "eletronicos.carregador-do-celular",
    categoria: "eletronicos",
    texto: "Carregador do celular",
  },
  {
    itemKey: "eletronicos.bateria-portatil",
    categoria: "eletronicos",
    texto: "Bateria portátil carregada",
  },
  {
    itemKey: "eletronicos.fones-de-ouvido",
    categoria: "eletronicos",
    texto: "Fones de ouvido",
  },
  {
    itemKey: "eletronicos.adaptador-de-tomada",
    categoria: "eletronicos",
    texto: "Adaptador ou extensão de tomada",
  },

  // antes de sair de casa
  {
    itemKey: "antes.fechar-agua-luz-e-gas",
    categoria: "antes",
    texto: "Fechar o registro de água e o gás e desligar a luz",
  },
  {
    itemKey: "antes.lixo-e-geladeira",
    categoria: "antes",
    texto: "Tirar o lixo e conferir o que perece na geladeira",
  },
  {
    itemKey: "antes.avisar-alguem",
    categoria: "antes",
    texto: "Avisar alguém de confiança sobre o roteiro",
  },
  {
    itemKey: "antes.trancar-e-janelas",
    categoria: "antes",
    texto: "Trancar portas e janelas",
  },
  {
    itemKey: "antes.cuidados-com-animal",
    categoria: "antes",
    texto: "O que o seu animal de estimação precisa, se ele for junto",
  },
];
