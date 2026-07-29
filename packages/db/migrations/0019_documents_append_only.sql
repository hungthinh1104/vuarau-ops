-- Custom SQL migration file, put your code below! --
CREATE TRIGGER documents_append_only
  BEFORE UPDATE OR DELETE ON documents
  FOR EACH ROW EXECUTE FUNCTION vuarau_forbid_mutation();
