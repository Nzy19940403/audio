import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import {map} from 'rxjs/operators'
@Injectable({
  providedIn: 'root'
})
export class AudioService {

  constructor(
    private http:HttpClient
  ) { }

  getAudio(list:any[]){
    let target:Observable<any>[] = [];
    list.forEach(element => {
      let requestObject = this.http.get(`assets/1-${element}.mp3`,{
        responseType:'arraybuffer'
      })
      .pipe(
        map(
          res=>{
            return {
              value:res,
              id:element
            }
          }
        )
      )
      target.push(requestObject)
    });

    return forkJoin(target)
  
  }
}
