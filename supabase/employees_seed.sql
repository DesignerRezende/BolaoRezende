-- Limpar dados existentes
delete from authorized_employees where true;

-- Inserir CPFs de teste (dados fictícios)
insert into authorized_employees (name, cpf_digits, store_sector, active)
values
  ('Romulo Rezende', '12873843748', 'Diretoria', true),
  ('Maria Silva', '45678901234', 'Loja Centro', true),
  ('João Santos', '78901234567', 'Loja Zona Sul', true),
  ('Ana Costa', '23456789012', 'Financeiro', true),
  ('Carlos Oliveira', '34567890123', 'TI', true),
  ('Beatriz Lima', '56789012345', 'RH', true),
  ('Diego Marques', '89012345678', 'Loja Norte', true),
  ('Fernanda Alves', '90123456789', 'Logística', true),
  ('Gabriel Teixeira', '01234567890', 'Vendas', true),
  ('Helena Rocha', '11111111111', 'Administrativo', true);
