do $$
begin
  alter type activity_type add value if not exists 'product_adjusted';
exception
  when undefined_object then
    null;
end $$;
