import Axios from "axios";
const API = "http://localhost:8000/v1/combo";

export class ComBoService {
  getComBoByTypeLink(type, limit) {
    return Axios.get(`${API}/combos/${type}/${limit}`);
  }
  getDetailComBo(id) {
    return Axios.get(`${API}/${id}`);
  }
}
